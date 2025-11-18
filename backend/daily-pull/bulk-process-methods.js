const { bulkSaveMembers } = require('../members-data-methods');

const { generateUpdatedMemberData } = require('./process-member-methods');
const { changeWixMembersEmails } = require('./utils');

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
    const toChangeWixMembersEmails = [];
    const toSaveMembersData = validMemberData.map(member => {
      const { isLoginEmailChanged, ...restMemberData } = member;
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

module.exports = { bulkProcessAndSaveMemberData };
