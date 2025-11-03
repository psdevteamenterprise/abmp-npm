const { COLLECTIONS } = require('../public/consts');

const { wixData } = require('./elevated-modules');
const { createSiteMember } = require('./members-area-methods');
const { createBatches, normalizeUrlForComparison, queryAllItems } = require('./utils');

/**
 * Retrieves member data by member ID
 * @param {string} memberId - The member ID to search for
 * @returns {Promise<Object|null>} - Member data or null if not found
 */
async function findMemberByWixDataId(memberId) {
  if (!memberId) {
    throw new Error('Member ID is required');
  }
  try {
    const member = await wixData.get(COLLECTIONS.MEMBERS_DATA, memberId);
    return member;
  } catch (error) {
    throw new Error(`Failed to retrieve member data: ${error.message}`);
  }
}

async function createContactAndMemberIfNew(memberData) {
  if (!memberData) {
    throw new Error('Member data is required');
  }
  try {
    const toCreateMemberData = {
      firstName: memberData.firstName,
      lastName: memberData.lastName,
      email: memberData.email,
      phones: memberData.phones,
      contactFormEmail: memberData.contactFormEmail || memberData.email,
    };
    const contactId = await createSiteMember(toCreateMemberData);
    let memberDataWithContactId = {
      ...memberData,
      contactId,
    };
    const updatedResult = await wixData.update(COLLECTIONS.MEMBERS_DATA, memberDataWithContactId);
    memberDataWithContactId = {
      ...memberDataWithContactId,
      ...updatedResult,
    };
    return memberDataWithContactId;
  } catch (error) {
    console.error('Error creating contact and member if new:', error);
    throw new Error(`Failed to create contact and member if new: ${error.message}`);
  }
}

/**
 * Performs bulk save operation for member data
 * @param {Array} memberDataList - Array of member data objects to save
 * @returns {Promise<Object>} - Bulk save operation result
 */
async function bulkSaveMembers(memberDataList) {
  if (!Array.isArray(memberDataList) || memberDataList.length === 0) {
    throw new Error('Invalid member data list provided for bulk save');
  }

  try {
    // bulkSave all with batches of 1000 items as this is the Velo limit for bulkSave
    const batches = createBatches(memberDataList, 1000);
    return await Promise.all(
      batches.map(batch => wixData.bulkSave(COLLECTIONS.MEMBERS_DATA, batch))
    );
  } catch (error) {
    console.error('Error bulk saving members:', error);
    throw new Error(`Bulk save failed: ${error.message}`);
  }
}
/**
 * Retrieves member data by member ID
 * @param {string} memberId - The member ID to search for
 * @returns {Promise<Object|null>} - Member data or null if not found
 */
async function findMemberById(memberId) {
  if (!memberId) {
    throw new Error('Member ID is required');
  }

  try {
    const queryResult = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .eq('memberId', memberId)
      .find();

    return queryResult.items.length > 0 ? queryResult.items[0] : null;
  } catch (error) {
    throw new Error(`Failed to retrieve member data: ${error.message}`);
  }
}

/**
 * Method to get member by slug with flexible filtering options
 * @param {Object} options - Query options
 * @param {string} options.slug - The slug to search for
 * @param {boolean} options.excludeDropped - Whether to exclude dropped members (default: true)
 * @param {boolean} options.excludeSearchedMember - Whether to exclude a specific member (default: false)
 * @param {string|number} [options.memberId] - Member ID to exclude when excludeSearchedMember is true (optional)
 * @param {boolean} [options.queryAllMatches=false] - Whether to query all matches or just the first one (default: false)
 * @returns {Promise<Object|null>} - Member data or null if not found
 */
async function getMemberBySlug({
  slug,
  excludeDropped = true,
  excludeSearchedMember = false,
  memberId = null,
  queryAllMatches = false,
}) {
  if (!slug) return null;

  try {
    let query = wixData.query(COLLECTIONS.MEMBERS_DATA).contains('url', slug);

    if (excludeDropped) {
      query = query.ne('action', 'drop');
    }

    if (excludeSearchedMember && memberId) {
      query = query.ne('memberId', memberId);
    }
    let membersList;
    if (queryAllMatches) {
      query = query.limit(1000);
      membersList = await queryAllItems(query);
    } else {
      membersList = await query.find().then(res => res.items);
    }
    let matchingMembers = membersList.filter(
      item => item.url && item.url.toLowerCase() === slug.toLowerCase()
    );
    if (queryAllMatches) {
      matchingMembers = membersList
        .filter(
          //remove trailing "-1", "-2", etc.
          item => item.url && normalizeUrlForComparison(item.url) === slug.toLowerCase()
        )
        .sort((a, b) => b.url.toLowerCase().localeCompare(a.url.toLowerCase()));
    }
    if (matchingMembers.length > 1) {
      const queryResultMsg = `Multiple members found with same slug ${slug} membersIds are : [${matchingMembers
        .map(member => member.memberId)
        .join(', ')}]`;
      if (!queryAllMatches) {
        throw new Error(queryResultMsg);
      } else {
        console.log(queryResultMsg);
      }
    }
    return matchingMembers[0] || null;
  } catch (error) {
    console.error('Error getting member by slug:', error);
    throw error;
  }
}

module.exports = {
  findMemberByWixDataId,
  createContactAndMemberIfNew,
  bulkSaveMembers,
  findMemberById,
  getMemberBySlug,
};
