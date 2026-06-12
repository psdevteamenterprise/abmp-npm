const { COLLECTIONS } = require('../public/consts');
const { isWixHostedImage, emailsMatch, normalizeEmail } = require('../public/Utils/sharedUtils');

const { MEMBERSHIPS_TYPES } = require('./consts');
const { createSiteContact } = require('./contacts-methods');
const { MEMBER_ACTIONS } = require('./daily-pull/consts');
const { wixData } = require('./elevated-modules');
const { updateMemberContactInfo } = require('./member-contact-orchestration');
const { createSiteMember, getCurrentMember } = require('./members-area-methods');
const {
  chunkArray,
  normalizeUrlForComparison,
  sortByUrlCounterDescending,
  queryAllItems,
  generateGeoHash,
  searchAllItems,
  runIf,
  withTransientErrorRetry,
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

const hasDifferentEmails = memberData =>
  Boolean(memberData.contactFormEmail) &&
  !emailsMatch(memberData.contactFormEmail, memberData.email);

/**
 * Returns a shallow copy of a member record with its email fields normalized
 * (lowercased + trimmed). Wix CRM and our uniqueness checks treat emails
 * case-insensitively, so we persist them in canonical form to keep `.eq` lookups
 * reliable. Only rewrites string values that are actually present.
 * @param {Object} memberData
 * @returns {Object}
 */
const normalizeMemberEmailFields = memberData => {
  if (!memberData || typeof memberData !== 'object') return memberData;
  const normalized = { ...memberData };
  if (typeof normalized.email === 'string') {
    normalized.email = normalizeEmail(normalized.email);
  }
  if (typeof normalized.contactFormEmail === 'string') {
    normalized.contactFormEmail = normalizeEmail(normalized.contactFormEmail);
  }
  return normalized;
};

/**
 * Whether a member's stored email fields are not already in canonical form
 * (lowercased + trimmed) and therefore need the normalization backfill.
 * @param {Object} member
 * @returns {boolean}
 */
const memberNeedsEmailNormalization = member =>
  (typeof member.email === 'string' &&
    member.email.length > 0 &&
    member.email !== normalizeEmail(member.email)) ||
  (typeof member.contactFormEmail === 'string' &&
    member.contactFormEmail.length > 0 &&
    member.contactFormEmail !== normalizeEmail(member.contactFormEmail));

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
      contactFormEmail: memberData.contactFormEmail,
    };
    const needsWixMember = !memberData.wixMemberId;
    const needsWixContact = !memberData.wixContactId;
    const hasContactEmailDifferentFromLogin = hasDifferentEmails(memberData);
    console.log('needsWixMember', needsWixMember);
    console.log('needsWixContact', needsWixContact);
    console.log('hasContactEmailDifferentFromLogin', hasContactEmailDifferentFromLogin);

    const [newWixMemberId, createdWixContactId] = await Promise.all([
      runIf(needsWixMember, () => createSiteMember(toCreateMemberData)),
      runIf(needsWixContact && hasContactEmailDifferentFromLogin, () =>
        createSiteContact(toCreateMemberData)
      ),
    ]);
    const memberContactId = newWixMemberId;
    const newWixContactId = createdWixContactId || memberContactId;
    console.log('newWixMemberId', newWixMemberId);
    console.log('memberContactId', memberContactId);
    console.log('newWixContactId', newWixContactId);
    let memberDataWithContactId = {
      ...memberData,
      wixMemberId: newWixMemberId || memberData.wixMemberId,
      wixContactId: newWixContactId || memberData.wixContactId,
    };
    console.log('latest WixMemberId', memberDataWithContactId.wixMemberId);
    console.log('latest WixContactId', memberDataWithContactId.wixContactId);
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
    // Normalize email fields only for the members collection; other collections passed here
    // (e.g. staging copies) don't have these fields and must be saved untouched.
    const listToSave =
      collectionName === COLLECTIONS.MEMBERS_DATA
        ? memberDataList.map(normalizeMemberEmailFields)
        : memberDataList;
    // bulkSave all with batches of 1000 items as this is the Velo limit for bulkSave
    const batches = chunkArray(listToSave, 1000);
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
    const queryResult = await withTransientErrorRetry(() =>
      wixData.query(COLLECTIONS.MEMBERS_DATA).eq('memberId', memberId).limit(2).find()
    );
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
 * Retrieves existing members for a list of member IDs in bulk.
 * Uses chunked `hasSome` queries so a full page of members costs a handful of
 * requests instead of one query per member (the per-member fan-out made a whole
 * page fail whenever a single query hit a transient "fetch failed").
 * @param {Array<string|number>} memberIds - Member IDs to look up
 * @returns {Promise<Map<string, Object>>} - Map of String(memberId) to member record (missing IDs are absent)
 */
async function findMembersByIds(memberIds) {
  const uniqueIds = [...new Set((memberIds || []).filter(id => id !== undefined && id !== null))];
  const membersById = new Map();
  if (uniqueIds.length === 0) {
    return membersById;
  }

  try {
    const idChunks = chunkArray(uniqueIds, 100);
    const chunkResults = await Promise.all(
      idChunks.map(idsChunk =>
        withTransientErrorRetry(() =>
          queryAllItems(
            wixData.query(COLLECTIONS.MEMBERS_DATA).hasSome('memberId', idsChunk).limit(1000)
          )
        )
      )
    );

    const duplicateIds = new Set();
    chunkResults.flat().forEach(member => {
      const key = String(member.memberId);
      if (membersById.has(key)) {
        duplicateIds.add(key);
      }
      membersById.set(key, member);
    });
    if (duplicateIds.size > 0) {
      throw new Error(`Multiple members found with memberId(s): [${[...duplicateIds].join(', ')}]`);
    }
    return membersById;
  } catch (error) {
    console.error('Error finding members by IDs:', error);
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
        .sort(sortByUrlCounterDescending);
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
    const errorMessage = `Error getting member by slug: ${slug} : ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
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
    const updatedMember = await wixData.update(
      COLLECTIONS.MEMBERS_DATA,
      normalizeMemberEmailFields(memberToUpdate)
    );
    return updatedMember;
  } catch (error) {
    throw new Error(`Failed to update member data: ${error.message}`);
  }
}
/**
 * Whether the given email is already used by a DIFFERENT member (case-insensitive).
 * Returns false when the email is free or belongs to the same member, so a member can
 * always keep/normalize their own email.
 * @param {string} email
 * @param {string|number} memberId - The member requesting the change
 * @returns {Promise<boolean>}
 */
async function isEmailAlreadyUsed(email, memberId) {
  const member = await getMemberByContactEmail(email);
  return member !== null && String(member.memberId) !== String(memberId);
}
/**
 * Finds the member that owns an email (in either the login or contact-form field),
 * matching case-insensitively. Emails are normalized (lowercased + trimmed) on write and
 * backfilled by the email-normalization migration, so stored values are canonical: a single
 * `.eq` against the normalized email is an exact, case-insensitive lookup.
 * Throws if two DIFFERENT members share the email (a data-integrity violation).
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function getMemberByContactEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const members = await wixData
    .query(COLLECTIONS.MEMBERS_DATA)
    .eq('contactFormEmail', normalized)
    .or(wixData.query(COLLECTIONS.MEMBERS_DATA).eq('email', normalized))
    .limit(2)
    .find()
    .then(res => res.items);

  if (members.length > 1) {
    throw new Error(
      `[getMemberByContactEmail] Multiple members found with same loginemail or contactFormEmail ${email} membersIds are : [${members.map(member => member.memberId).join(', ')}]`
    );
  }
  return members[0] || null;
}
/**
 * Saves member registration data (supports partial updates)
 * @param {Object} data - Member data to save (can be partial - only fields being updated)
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
    if (data.contactFormEmail) {
      const isDuplicate = await isEmailAlreadyUsed(data.contactFormEmail, data.memberId);
      if (isDuplicate) {
        return {
          type: 'error',
          error: 'Contact Email is already taken. Please choose a different one.',
        };
      }
    }
    // Fetch existing data to merge with partial update
    const existingMemberData = await findMemberByWixDataId(id);

    if (!existingMemberData) {
      return {
        type: 'error',
        error: 'Member not found',
      };
    }

    // Merge partial data with existing data (incoming data takes precedence)
    const mergedData = {
      ...existingMemberData,
      ...data,
    };

    if (data.addresses && Array.isArray(data.addresses)) {
      mergedData.locHash = generateGeoHash(data.addresses);
    }

    const dataToSave = await updateMemberContactInfo(mergedData, existingMemberData);
    const saveData = await updateMember(dataToSave);
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

    // Filter for external images (not 'wix hosted images')
    const membersWithExternalImages = allItems.filter(
      member => member.profileImage && !isWixHostedImage(member.profileImage)
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
    .ne('memberships.membertype', MEMBERSHIPS_TYPES.STUDENT)
    //.isNotEmpty('url') - not used because it's not working as expected
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
  const filtered = allItems.filter(
    item => typeof item.url === 'string' && !item.url.includes('/') && item.url !== ''
  );
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

/**
 * Gets all members whose email or contactFormEmail is stored with non-canonical casing
 * (or surrounding whitespace) and therefore needs the normalization backfill.
 * Wix Data cannot compare a field to its own lowercase form, so we fetch members that have
 * an email set and filter in memory.
 * @returns {Promise<Array>} - Array of member data
 */
const getAllMembersNeedingEmailNormalization = async () => {
  try {
    const membersQuery = wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .isNotEmpty('email')
      .or(wixData.query(COLLECTIONS.MEMBERS_DATA).isNotEmpty('contactFormEmail'))
      .limit(1000);

    const allItems = await queryAllItems(membersQuery);
    return allItems.filter(memberNeedsEmailNormalization);
  } catch (error) {
    console.error('Error getting members needing email normalization:', error);
    throw new Error(`Failed to get members needing email normalization: ${error.message}`);
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
    // Login emails are normalized on write, so match against the normalized value (see
    // getMemberByContactEmail) — an exact `.eq` is a case-insensitive lookup.
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const members = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .eq('email', normalized)
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
 * @returns {Promise<Object>} - Member data with contact and member IDs
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
    console.error(`Error in prepareMemberForSSOLogin: ${error.message}`);
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
    const errMsg = `[prepareMemberForQALogin] QA Login failed with error: ${error.message} for email: ${email}`;
    console.error(errMsg);
    throw new Error(errMsg);
  }
}

/**
 * Tracks a button click with member and location info.
 * @param {Object} params - Parameters
 * @param {string} params.pageName - Name of the page/popup where button was clicked
 * @param {string} params.buttonName - Name/ID of the button that was clicked
 * @param {Object} [params.data] - Optional data object to store with the click (e.g., form data being saved)
 * @returns {Promise<Object>} - Saved record or null if member not found
 */
async function trackButtonClick({ pageName, buttonName, data }) {
  const wixMember = await getCurrentMember();

  if (!wixMember) {
    console.warn('[trackButtonClick]: No logged in member found');
    return null;
  }

  const dbMember = await getCMSMemberByWixMemberId(wixMember._id);

  if (!dbMember) {
    console.warn(
      `[trackButtonClick]: Member not found in MembersDataLatest for wixMemberId: ${wixMember._id}`
    );
    return null;
  }

  const memberName = dbMember.fullName || 'Unknown';
  const memberId = dbMember.memberId;
  const memberEmail = dbMember.email;

  const clickData = {
    memberName,
    memberId,
    pageName,
    buttonName,
    memberEmail,
    clickedAt: new Date(),
    ...(data && { data }),
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

async function getAllMembersWithWixMemberId() {
  const membersQuery = wixData.query(COLLECTIONS.MEMBERS_DATA).isNotEmpty('wixMemberId');
  return await queryAllItems(membersQuery);
}

module.exports = {
  findMemberByWixDataId,
  createContactAndMemberIfNew,
  getAllMembersWithWixMemberId,
  saveRegistrationData,
  bulkSaveMembers,
  findMemberById,
  findMembersByIds,
  getMemberBySlug,
  getCMSMemberByWixMemberId,
  getAllEmptyAboutYouMembers,
  updateMember,
  getAllMembersWithExternalImages,
  getMembersWithWixUrl,
  getAllMembersWithoutContactFormEmail,
  getAllMembersNeedingEmailNormalization,
  memberNeedsEmailNormalization,
  getAllUpdatedLoginEmails,
  getMembersByIds,
  getMemberByEmail,
  getQAUsers,
  prepareMemberForSSOLogin,
  prepareMemberForQALogin,
  checkUrlUniqueness,
  trackButtonClick,
  isEmailAlreadyUsed,
};
