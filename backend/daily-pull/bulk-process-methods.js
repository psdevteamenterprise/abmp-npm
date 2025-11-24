const { bulkSaveMembers, getMemberBySlug } = require('../members-data-methods');

const { generateUpdatedMemberData } = require('./process-member-methods');
const {
  changeWixMembersEmails,
  extractUrlCounter,
  incrementUrlCounter,
  extractBaseUrl,
} = require('./utils');

/**
 * Ensures unique URLs within a batch of members by deduplicating URLs
 * Groups members by their base URL (normalized) and assigns unique counters
 * Also checks database to handle cross-page conflicts
 * @param {Array} memberDataList - Array of processed member data
 * @returns {Promise<Array>} - Array of members with unique URLs assigned
 */
async function ensureUniqueUrlsInBatch(memberDataList) {
  if (!Array.isArray(memberDataList) || memberDataList.length === 0) {
    return memberDataList;
  }

  // Group members by their normalized base URL
  const urlGroups = new Map();

  memberDataList.forEach(member => {
    if (!member || !member.url) {
      return;
    }

    // Extract the base URL (without any counter) for grouping
    const baseUrl = extractBaseUrl(member.url);
    if (!urlGroups.has(baseUrl)) {
      urlGroups.set(baseUrl, []);
    }
    urlGroups.get(baseUrl).push(member);
  });

  // For each group, check database and assign unique URLs sequentially
  for (const [baseUrl, members] of urlGroups.entries()) {
    if (members.length <= 1) {
      // Single member - still check DB to ensure it doesn't conflict with other pages
      const member = members[0];
      if (member) {
        const dbMember = await getMemberBySlug({
          slug: baseUrl,
          excludeDropped: false,
          normalizeSlugForComparison: true,
        });

        if (dbMember && dbMember.url) {
          // Conflict found in DB, need to add counter
          member.url = incrementUrlCounter(dbMember.url, baseUrl);
          console.log(
            `Found DB conflict for single member with base URL "${baseUrl}", assigned: ${member.url}`
          );
        }
      }
      continue;
    }

    // Sort members to ensure consistent ordering
    members.sort((a, b) => {
      if (a.url && b.url) {
        return String(a.url).localeCompare(String(b.url));
      }
      return 0;
    });

    // Check database for existing members with this base URL to find highest counter
    const dbMember = await getMemberBySlug({
      slug: baseUrl,
      excludeDropped: false,
      normalizeSlugForComparison: true,
    });

    const dbMaxCounter = extractUrlCounter(dbMember?.url);

    // Find the highest existing counter among all members in this batch group
    let batchMaxCounter = -1;
    members.forEach(member => {
      const originalUrl = member.url;
      const urlParts = originalUrl.split('-');
      const lastSegment = urlParts[urlParts.length - 1];
      const isNumeric = /^\d+$/.test(lastSegment);
      if (isNumeric) {
        const counter = parseInt(lastSegment, 10);
        if (counter > batchMaxCounter) {
          batchMaxCounter = counter;
        }
      }
    });

    // Start index from the maximum of DB counter and batch counter + 1
    const maxCounter = Math.max(dbMaxCounter, batchMaxCounter);
    const startIndex = maxCounter + 1;

    // Assign unique URLs: start from the appropriate index
    members.forEach((member, index) => {
      const assignedIndex = startIndex + index;
      if (assignedIndex === 0) {
        // Index 0 means no counter, use baseUrl
        member.url = baseUrl;
      } else {
        // Index > 0 means add counter
        member.url = `${baseUrl}-${assignedIndex}`;
      }
    });

    console.log(
      `Deduplicated ${
        members.length
      } members with base URL "${baseUrl}" (DB max: ${dbMaxCounter}, batch max: ${batchMaxCounter}, start: ${startIndex}): ${members
        .map(m => m.url)
        .join(', ')}`
    );
  }

  return memberDataList;
}

/**
 * Processes and saves multiple member records in bulk
 * @param {Object} options - The options object
 * @param {Array} options.memberDataList - Array of member data from API
 * @param {number} options.currentPageNumber - Current page number being processed
 * @param {boolean} [options.addInterests=true] - Whether to add interests to the member data
 * @param {Array} memberDataList - Array of member data from API
 * @returns {Promise<Object>} - Bulk save operation result with statistics
 */
const bulkProcessAndSaveMemberData = async ({
  memberDataList,
  currentPageNumber,
  addInterests = true,
}) => {
  if (!Array.isArray(memberDataList) || memberDataList.length === 0) {
    throw new Error('Invalid member data list provided');
  }

  const startTime = Date.now();

  try {
    const processedMemberDataPromises = memberDataList.map(memberData =>
      generateUpdatedMemberData({
        inputMemberData: memberData,
        currentPageNumber,
        addInterests,
      })
    );

    const processedMemberDataList = await Promise.all(processedMemberDataPromises);
    const validMemberData = processedMemberDataList.filter(
      data => data !== null && data !== undefined
    );
    if (validMemberData.length === 0) {
      return {
        totalProcessed: memberDataList.length,
        totalSaved: 0,
        totalFailed: memberDataList.length,
        processingTime: Date.now() - startTime,
      };
    }
    const newMembers = validMemberData.filter(data => data.isNewToDb);
    const existingMembers = validMemberData.filter(data => !data.isNewToDb);
    // Ensure unique URLs within the batch to prevent duplicates (also checks DB for cross-page conflicts)
    const uniqueUrlsNewToDBMembersList = await ensureUniqueUrlsInBatch(newMembers);
    const uniqueUrlsMembersData = [...uniqueUrlsNewToDBMembersList, ...existingMembers];
    const toChangeWixMembersEmails = [];
    const toSaveMembersData = uniqueUrlsMembersData.map(member => {
      const { isLoginEmailChanged, isNewToDb: _isNewToDb, ...restMemberData } = member;
      if (member.contactId && isLoginEmailChanged) {
        toChangeWixMembersEmails.push(member);
      }
      return restMemberData; //we don't want to store the isLoginEmailChanged in the database, it's just a flag to know if we need to change the login email in Members area
    });
    const saveResult = await bulkSaveMembers(toSaveMembersData);
    // Change login emails for users who was dropped but now are back to system as new members and have different loginEmail for users with action DROP
    if (toChangeWixMembersEmails.length > 0) {
      await changeWixMembersEmails(toChangeWixMembersEmails);
    }
    const totalFailed = memberDataList.length - validMemberData.length;
    const processingTime = Date.now() - startTime;

    return {
      ...saveResult,
      totalProcessed: memberDataList.length,
      totalSaved: validMemberData.length,
      totalFailed: totalFailed,
      processingTime: processingTime,
    };
  } catch (error) {
    throw new Error(`Bulk operation failed: ${error.message}`);
  }
};

module.exports = { bulkProcessAndSaveMemberData, ensureUniqueUrlsInBatch };
