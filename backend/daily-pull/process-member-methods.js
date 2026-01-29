const { findMemberById, getMemberBySlug } = require('../members-data-methods');
const { isValidArray, generateGeoHash } = require('../utils');

const { MEMBER_ACTIONS, DEFAULT_MEMBER_DISPLAY_SETTINGS } = require('./consts');
const { validateCoreMemberData, containsNonEnglish, createFullName } = require('./utils');

/**
 * Ensures a URL is unique by appending a counter if necessary
 * @param {Object} options - The options object
 * @param {string} options.url - The base URL to make unique
 * @param {string|number} options.memberId - The member ID requesting this URL
 * @param {string} options.fullName - The full name of the member
 * @returns {Promise<string>} - A unique URL
 */
const ensureUniqueUrl = async ({ url, memberId, fullName }) => {
  const baseUrl = url;
  let uniqueUrl = url;
  if (!url) {
    console.log(`member with id ${memberId} has no url, creating one`);
    const fullNameWithoutSpace = fullName?.replace(/ /g, '');
    if (!fullNameWithoutSpace || containsNonEnglish(fullNameWithoutSpace)) {
      console.log(
        `member with id ${memberId} has non-english full name, will use fallback url: 'firstNameLastName'`
      );
      uniqueUrl = 'firstNameLastName';
    } else {
      uniqueUrl = fullNameWithoutSpace; //fallback if there is no full name for this user
    }
    console.log(
      `member with id ${memberId} and  no API provided url, will have this initial url ${uniqueUrl}`
    );
  }
  if (!memberId) throw new Error('Member ID is required');

  const existingMember = await getMemberBySlug({
    slug: uniqueUrl,
    excludeDropped: false,
    excludeSearchedMember: true,
    memberId,
    normalizeSlugForComparison: true,
  });
  if (existingMember && existingMember.url) {
    console.log(
      `Found member with same url ${existingMember.url} for memberId ${memberId} and URL ${uniqueUrl}, increasing counter by 1`
    );
    const lastSegment = existingMember.url.split('-').pop() || '0';
    const lastCounter = parseInt(lastSegment, 10) || 0;
    uniqueUrl = `${uniqueUrl}-${lastCounter + 1}`;
  }
  if (uniqueUrl !== baseUrl) {
    console.log(`URL conflict resolved: ${baseUrl} -> ${uniqueUrl} for member ${memberId}`);
  }
  return uniqueUrl;
};

/**
 * Generates complete updated member data by combining existing and migration data
 * @param {Object} options - The options object
 * @param {Object} options.inputMemberData - Raw member data from API
 * @param {number} options.currentPageNumber - Current page number being processed
 * @returns {Promise<Object|null>} - Complete updated member data or null if validation fails
 */
async function generateUpdatedMemberData({ inputMemberData, currentPageNumber }) {
  if (!validateCoreMemberData(inputMemberData)) {
    throw new Error(
      'Invalid member data: memberid, email (valid string), and memberships (array) are required'
    );
  }

  const existingDbMember = await findMemberById(inputMemberData.memberid);

  const updatedMemberData = await createCoreMemberData(
    inputMemberData,
    existingDbMember,
    currentPageNumber
  );

  // If createCoreMemberData returns null due to validation failure, return null
  if (!updatedMemberData) {
    return null;
  }

  // Only add address data for new members
  if (!existingDbMember && isValidArray(inputMemberData.addresses)) {
    updatedMemberData.addresses = inputMemberData.addresses;
  }

  return { ...updatedMemberData, isNewToDb: !existingDbMember };
}
/**
 * Helper function to get fields that should only be set for new members
 * @param {Object} inputMemberData - Raw member data from API
 * @param {Object} existingDbMember - Existing member data from database
 * @returns {Promise<Object>} - Object with fields that should only be set for new members
 */
async function getNewMemberOnlyFields(inputMemberData, existingDbMember) {
  if (existingDbMember) {
    return {};
  }

  // Only set these fields for new members
  const sanitizedFirstName = inputMemberData.firstname?.trim() || '';
  const sanitizedLastName = inputMemberData.lastname?.trim() || '';
  const fullName = createFullName(sanitizedFirstName, sanitizedLastName);

  const uniqueUrl = await ensureUniqueUrl({
    url: inputMemberData.url,
    memberId: inputMemberData.memberid,
    fullName,
  });
  return {
    memberId: inputMemberData.memberid,
    firstName: sanitizedFirstName,
    lastName: sanitizedLastName,
    fullName,
    phones: inputMemberData.phones || [],
    optOut: false,
    url: uniqueUrl,
    showContactForm: true,
    showABMP: false,
    locHash: generateGeoHash(inputMemberData.addresses || []),
    ...DEFAULT_MEMBER_DISPLAY_SETTINGS,
  };
}
/**
 * Creates base member data structure with core properties
 * @param {Object} inputMemberData - Raw member data from API
 * @param {Object} existingDbMember - Existing member data from database
 * @param {number} currentPageNumber - Current page number being processed
 * @returns {Promise<Object|null>} - Structured base member data or null if required fields are missing
 */
async function createCoreMemberData(inputMemberData, existingDbMember, currentPageNumber) {
  if (!validateCoreMemberData(inputMemberData)) {
    return null;
  }

  const getMemberEmails = () => {
    // Update both loginEmail & contactFormEmail only for new members who don't exist in DB
    // Note: PAC API member actions are not reliable, so we need to check if the member exists in DB to know if it's a new member or not
    const newEmail = inputMemberData.email.trim();
    const isMemberExistInDb = Boolean(existingDbMember?._id);
    if (!isMemberExistInDb) {
      return {
        email: newEmail,
        contactFormEmail: newEmail,
      };
    }
    //If exists in DB then only update loginEmail for those who came in with action new based on logic below, otherwise we don't update emails
    const isMemberReinstatedWithNewEmail =
      inputMemberData.action === MEMBER_ACTIONS.NEW &&
      newEmail &&
      existingDbMember.email !== newEmail;
    if (isMemberReinstatedWithNewEmail) {
      // If exists in DB, and email was changed means this user was dropped before that's why it exists in DB, then only update loginEmail not contactFormEmail
      return {
        email: newEmail,
        isLoginEmailChanged: true,
      };
    }
    //If exists in DB but not reinstated with new email, then don't update emails
    return {};
  };

  const newMemberFields = await getNewMemberOnlyFields(inputMemberData, existingDbMember);

  return {
    ...existingDbMember,

    // Always update these core fields from API
    action: inputMemberData.action,
    licenses: inputMemberData.licenses || [],
    memberships: inputMemberData.memberships,
    pageNumber: currentPageNumber,
    isVisible: inputMemberData.action !== MEMBER_ACTIONS.DROP,

    // Handle Member emails
    ...getMemberEmails(),

    // Handle fields that should only be set for new members
    ...newMemberFields,
  };
}

module.exports = {
  generateUpdatedMemberData,
  ensureUniqueUrl,
};
