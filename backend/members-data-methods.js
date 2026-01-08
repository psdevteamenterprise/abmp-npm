const { COLLECTIONS } = require('../public/consts');

const { MEMBERSHIPS_TYPES } = require('./consts');
const { updateMemberContactInfo, createSiteContact } = require('./contacts-methods');
const { MEMBER_ACTIONS } = require('./daily-pull/consts');
const { wixData } = require('./elevated-modules');
const { createSiteMember, getCurrentMember } = require('./members-area-methods');
const {
  chunkArray,
  normalizeUrlForComparison,
  queryAllItems,
  generateGeoHash,
  searchAllItems,
} = require('./utils');

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
    const needsWixMember = !memberData.wixMemberId;
    const needsWixContact = !memberData.wixContactId;
    const [newWixMemberId, newWixContactId] = await Promise.all([
      needsWixMember ? createSiteMember(toCreateMemberData) : Promise.resolve(null),
      needsWixContact ? createSiteContact(toCreateMemberData) : Promise.resolve(null),
    ]);
    let memberDataWithContactId = {
      ...memberData,
      wixMemberId: newWixMemberId || memberData.wixMemberId,
      wixContactId: newWixContactId || memberData.wixContactId,
    };
    const updatedResult = await updateMember(memberDataWithContactId);
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

/** Performs bulk save operation for member data
 * @param { Array } memberDataList - Array of member data objects to save
 * @param { string } [collectionName] - The collection name to save the members to (default: COLLECTIONS.MEMBERS_DATA)
 * @returns { Promise < Object >} - Bulk save operation result
 */
async function bulkSaveMembers(memberDataList, collectionName = COLLECTIONS.MEMBERS_DATA) {
  if (!Array.isArray(memberDataList) || memberDataList.length === 0) {
    throw new Error('Invalid member data list provided for bulk save');
  }

  try {
    // bulkSave all with batches of 1000 items as this is the Velo limit for bulkSave
    const batches = chunkArray(memberDataList, 1000);
    return await Promise.all(batches.map(batch => wixData.bulkSave(collectionName, batch)));
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
      .limit(2)
      .find();
    if (queryResult.items.length > 1) {
      throw new Error(
        `Multiple members found with memberId ${memberId} members _ids are : [${queryResult.items.map(member => member._id).join(', ')}]`
      );
    }
    return queryResult.items.length === 1 ? queryResult.items[0] : null;
  } catch (error) {
    console.error('Error finding member by ID:', error);
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
 * @param {boolean} [options.normalizeSlugForComparison=false] - Whether to normalize the slug for comparison (default: false)
 * @returns {Promise<Object|null>} - Member data or null if not found
 */
async function getMemberBySlug({
  slug,
  excludeDropped = true,
  excludeSearchedMember = false,
  memberId = null,
  normalizeSlugForComparison = false,
}) {
  if (!slug) return null;

  try {
    let query = wixData.search(COLLECTIONS.MEMBERS_DATA).expression(slug);

    if (excludeDropped) {
      query = query.ne('action', 'drop');
    }

    if (excludeSearchedMember && memberId) {
      query = query.ne('memberId', memberId);
    }
    query = query.limit(1000);
    const searchResult = await searchAllItems(query);
    const membersList = searchResult.filter(
      item => item.url && item.url.toLowerCase().includes(slug.toLowerCase())
    ); //replacement for contains - case insensitive
    let matchingMembers = membersList.filter(
      item => item.url && item.url.toLowerCase() === slug.toLowerCase()
    );
    if (normalizeSlugForComparison) {
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
      if (!normalizeSlugForComparison) {
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

async function getCMSMemberByWixMemberId(wixMemberId) {
  if (!wixMemberId) {
    throw new Error('Wix Member ID is required');
  }
  try {
    const members = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .eq('wixMemberId', wixMemberId)
      .limit(2)
      .find()
      .then(res => res.items);
    if (members.length > 1) {
      throw new Error(
        `[getCMSMemberByWixMemberId] Multiple members found with wixMemberId ${wixMemberId} membersIds are : [${members.map(member => member.memberId).join(', ')}]`
      );
    }
    return members[0] || null;
  } catch (error) {
    throw new Error(
      `[getCMSMemberByWixMemberId] Failed to retrieve member by wixMemberId ${wixMemberId} data: ${error.message}`
    );
  }
}
/**
 * Gets all members with aboutyoustatus as null
 * @returns {Promise<import('wix-data').WixDataQueryResult>} - WixDataQueryResult of member data
 */
const getAllEmptyAboutYouMembers = async () => {
  try {
    const membersQuery = wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .isEmpty('aboutYourSelf')
      .isNotEmpty('aboutYouHtml');
    return await queryAllItems(membersQuery);
  } catch (error) {
    console.error('Error getting empty about you members:', error);
    throw new Error(`Failed to get empty about you members: ${error.message}`);
  }
};

/**
 * updates member data
 * @param {Object} memberToUpdate - The member data to update
 * @returns {Promise<Object|null>} - Member data or null if not found
 */
async function updateMember(memberToUpdate) {
  try {
    const updatedMember = await wixData.update(COLLECTIONS.MEMBERS_DATA, memberToUpdate);
    return updatedMember;
  } catch (error) {
    throw new Error(`Failed to update member data: ${error.message}`);
  }
}
/**
 * Saves member registration data
 * @param {Object} data - Member data to save
 * @param {string} id - Member ID
 * @returns {Promise<Object>} Result object with type and data/error
 */
async function saveRegistrationData(data, id) {
  try {
    console.log(' saveRegistrationData data._id', data._id);
    console.log(' saveRegistrationData id', id);
    if (data._id !== id) return { type: 'notAuthorized' };

    if (data.url) {
      const isDuplicate = await urlExists(data.url, data.memberId);

      if (isDuplicate) {
        return {
          type: 'error',
          error: 'URL slug is already taken. Please choose a different one.',
        };
      }
    }

    if (data.addresses && Array.isArray(data.addresses)) {
      data.locHash = generateGeoHash(data.addresses);
    }

    const existingMemberData = await findMemberByWixDataId(id);

    await updateMemberContactInfo(data, existingMemberData);

    const saveData = await updateMember(data);
    return {
      type: 'success',
      saveData,
    };
  } catch (error) {
    console.error(error);
    return {
      type: 'error',
      error,
    };
  }
}

/**
 * Checks if a URL already exists in the database for a different member (case-insensitive)
 * @param {string} url - The URL to check
 * @param {string|number} excludeMemberId - Member ID to exclude from the check
 * @returns {Promise<boolean>} - True if URL exists for another member
 */
async function urlExists(url, excludeMemberId) {
  if (!url) return false;

  try {
    const member = await getMemberBySlug({
      slug: url,
      excludeDropped: false,
      excludeSearchedMember: true,
      memberId: excludeMemberId,
    });
    return member !== null;
  } catch (error) {
    console.error('Error checking URL existence:', error);
    return false;
  }
}

/**
 * Checks URL uniqueness for a member
 * @param {string} url - The URL to check
 * @param {string} memberId - The member ID to exclude from the check
 * @returns {Promise<Object>} Result object with isUnique boolean
 */
async function checkUrlUniqueness(url, memberId) {
  if (!url || !memberId) {
    throw new Error('Missing required parameters: url and memberId are required');
  }

  try {
    const trimmedUrl = url.trim();
    const exists = await urlExists(trimmedUrl, memberId);

    return { isUnique: !exists };
  } catch (error) {
    console.error('Error checking URL uniqueness:', error);
    throw new Error(`Failed to check URL uniqueness: ${error.message}`);
  }
}
/**
 * Get all members with external profile images
 * @returns {Promise<Array>} - Array of member IDs
 */
async function getAllMembersWithExternalImages() {
  try {
    const membersQuery = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .isNotEmpty('profileImage')
      .ne('profileImage', null);

    const allItems = await queryAllItems(membersQuery);

    // Filter for external images (not starting with 'wix:')
    const membersWithExternalImages = allItems.filter(
      member => member.profileImage && !member.profileImage.startsWith('wix:')
    );

    return membersWithExternalImages;
  } catch (error) {
    console.error('Error getting members with external images:', error);
    return [];
  }
}

async function getMembersWithWixUrl() {
  const membersQuery = wixData
    .query(COLLECTIONS.MEMBERS_DATA)
    .eq('isVisible', true)
    .eq('showWixUrl', true)
    .ne('action', MEMBER_ACTIONS.DROP)
    .ne('memberships.membertype', MEMBERSHIPS_TYPES.PAC_STAFF)
    .isNotEmpty('url')
    .limit(1000);
  let currentResults = await membersQuery.find();
  let i = 0;
  const allItems = currentResults.items;
  while (currentResults.hasNext()) {
    if (i % 50 === 0) console.log(`page ${i}`);
    currentResults = await currentResults.next();
    allItems.push(...currentResults.items);
    i++;
  }
  console.log('i is ', i);
  const filtered = allItems.filter(item => typeof item.url === 'string' && !item.url.includes('/'));
  console.log('filtered is ', filtered.length);
  return filtered;
}

/**
 * Gets all members who need contactFormEmail migration (missing contactFormEmail field)
 * @returns {Promise<Array>} - Array of member data
 */
const getAllMembersWithoutContactFormEmail = async () => {
  try {
    const membersQuery = wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .isEmpty('contactFormEmail')
      .isNotEmpty('email')
      .limit(1000);

    const allItems = await queryAllItems(membersQuery);
    return allItems;
  } catch (error) {
    console.error('Error getting members without contactFormEmail:', error);
    throw new Error(`Failed to get members without contactFormEmail: ${error.message}`);
  }
};

/* Gets all updated login emails from the updated emails database
 * @returns {Promise<Array>} - Array of updated email data
 */
const getAllUpdatedLoginEmails = async () => {
  try {
    const updatedEmailsQuery = await wixData
      .query(COLLECTIONS.UPDATED_LOGIN_EMAILS)
      .isNotEmpty('memberId')
      .isNotEmpty('loginEmail')
      .limit(1000);
    return await queryAllItems(updatedEmailsQuery);
  } catch (error) {
    console.error('Error getting updated login emails:', error);
    throw new Error(`Failed to get updated login emails: ${error.message}`);
  }
};
/**
 * Gets members by their member IDs for email sync
 * @param {Array} memberIds - Array of member IDs to fetch
 * @returns {Promise<Array>} - Array of member data
 */
const getMembersByIds = async memberIds => {
  try {
    const membersQuery = wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .hasSome('memberId', memberIds)
      .limit(1000);

    return await queryAllItems(membersQuery);
  } catch (error) {
    console.error('Error getting members by IDs:', error);
    throw new Error(`Failed to get members by IDs: ${error.message}`);
  }
};

const getMemberByEmail = async email => {
  try {
    const members = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .eq('email', email)
      .limit(2)
      .find()
      .then(res => res.items);
    if (members.length > 1) {
      throw new Error(
        `[getMemberByEmail] Multiple members found with email ${email} membersIds are : [${members.map(member => member.memberId).join(', ')}]`
      );
    }
    return members[0] || null;
  } catch (error) {
    console.error('Error getting member by email:', error);
    throw new Error(`Failed to get member by email: ${error.message}`);
  }
};

const getQAUsers = async () => {
  try {
    return await wixData
      .query(COLLECTIONS.QA_USERS)
      .include('member')
      .find()
      .then(res => res.items.map(item => item.member));
  } catch (error) {
    console.error('Error getting QA users:', error);
    throw new Error(`Failed to get QA users: ${error.message}`);
  }
};
/**
 * Ensures member has a contact - creates one if missing
 * @param {Object} memberData - Member data from DB
 * @returns {Promise<Object>} - Member data with contactId
 */
async function ensureWixMemberAndContactExist(memberData) {
  if (!memberData) {
    throw new Error('Member data is required');
  }
  if (!memberData.wixContactId || !memberData.wixMemberId) {
    const memberDataWithContactId = await createContactAndMemberIfNew(memberData);
    return memberDataWithContactId;
  }
  return memberData;
}
async function prepareMemberForSSOLogin(data) {
  try {
    console.log('data', data);
    const memberId = data?.pac?.cst_recno;
    if (!memberId) {
      throw new Error(`Member ID is missing in passed data ${JSON.stringify(data)}`);
    }
    const memberData = await findMemberById(Number(memberId));
    if (!memberData) {
      throw new Error(`Member data not found for memberId ${memberId}`);
    }
    console.log('memberData', memberData);
    return await ensureWixMemberAndContactExist(memberData);
  } catch (error) {
    console.error('Error in prepareMemberForSSOLogin', error.message);
    throw error;
  }
}
async function prepareMemberForQALogin(email) {
  try {
    console.log('qa email:', email);
    if (!email) {
      throw new Error(`Email is missing in passed data ${email}`);
    }
    const memberData = await getMemberByEmail(email);
    if (!memberData) {
      throw new Error(`Member data not found for email ${email}`);
    }
    console.log('memberData', memberData);
    return await ensureWixMemberAndContactExist(memberData);
  } catch (error) {
    console.error('Error in prepareMemberForQALogin', error.message);
    throw error;
  }
}

/**
 * Tracks a button click with member and location info.
 * @param {Object} params - Parameters
 * @param {string} params.pageName - Name of the page/popup where button was clicked
 * @param {string} params.buttonName - Name/ID of the button that was clicked
 * @returns {Promise<Object>} - Saved record or null if member not found
 */
async function trackButtonClick({ pageName, buttonName }) {
  const wixMember = await getCurrentMember();

  if (!wixMember) {
    console.warn('[trackButtonClick]: No logged in member found');
    return null;
  }

  const dbMember = await getCMSMemberByWixMemberId(wixMember._id);

  if (!dbMember) {
    console.warn(
      `[trackButtonClick]: Member not found in MembersDataLatest for contactId: ${wixMember._id}`
    );
    return null;
  }

  const memberName = dbMember.fullName || 'Unknown';
  const memberId = dbMember.memberId;

  const clickData = {
    memberName,
    memberId,
    pageName,
    buttonName,
    clickedAt: new Date(),
  };

  try {
    const result = await wixData.insert(COLLECTIONS.BUTTON_CLICKS, clickData);
    console.log(`Tracked ${buttonName} click on ${pageName} for member ${memberId}`);
    return result;
  } catch (error) {
    console.error(`Error tracking ${buttonName} click:`, error);
    throw error;
  }
}

module.exports = {
  findMemberByWixDataId,
  createContactAndMemberIfNew,
  saveRegistrationData,
  bulkSaveMembers,
  findMemberById,
  getMemberBySlug,
  getCMSMemberByWixMemberId,
  getAllEmptyAboutYouMembers,
  updateMember,
  getAllMembersWithExternalImages,
  getMembersWithWixUrl,
  getAllMembersWithoutContactFormEmail,
  getAllUpdatedLoginEmails,
  getMembersByIds,
  getMemberByEmail,
  getQAUsers,
  prepareMemberForSSOLogin,
  prepareMemberForQALogin,
  checkUrlUniqueness,
  trackButtonClick,
};
