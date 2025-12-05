const { ADDRESS_STATUS_TYPES } = require('../../public/consts');
const { findMemberById, getMemberBySlug } = require('../members-data-methods');
const { isValidArray, generateGeoHash } = require('../utils');

const {
  MEMBER_ACTIONS,
  ADDRESS_VISIBILITY_OPTIONS,
  DEFAULT_MEMBER_DISPLAY_SETTINGS,
} = require('./consts');
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
 * @param {string} options.addInterests - Site association of the member
 * @param {number} options.currentPageNumber - Current page number being processed
 * @returns {Promise<Object|null>} - Complete updated member data or null if validation fails
 */
async function generateUpdatedMemberData({
  inputMemberData,
  addInterests = true,
  currentPageNumber,
}) {
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

  // Only enrich with migration and address data for new members
  if (!existingDbMember) {
    enrichWithMigrationData({
      memberDataToUpdate: updatedMemberData,
      migrationData: inputMemberData.migrationData,
      addInterests,
    });

    enrichWithAddressData(
      updatedMemberData,
      inputMemberData.addresses,
      inputMemberData.migrationData?.addressinfo
    );
  }

  return { ...updatedMemberData, isNewToDb: !existingDbMember };
}

/**
 * Processes and adds address data with proper status
 * @param {Object} memberDataToUpdate - Member data object to enhance
 * @param {Array} addressesList - Array of address objects
 * @param {Object} addressDisplayInfo - Address visibility configuration
 */
function enrichWithAddressData(memberDataToUpdate, addressesList, addressDisplayInfo) {
  if (isValidArray(addressesList)) {
    memberDataToUpdate.addresses = processAddressesWithStatus(addressesList, addressDisplayInfo);
  }
}

/**
 * Processes multiple addresses with their display statuses
 * @param {Array} addressesList - Array of address objects
 * @param {Object} displayConfiguration - Address display configuration
 * @returns {Array} - Processed addresses with status information
 */
function processAddressesWithStatus(addressesList, displayConfiguration = {}) {
  if (!isValidArray(addressesList)) {
    return [];
  }

  return addressesList.map(address => {
    const displayStatus = displayConfiguration[address.key]
      ? determineAddressDisplayStatus(displayConfiguration[address.key])
      : ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;

    return {
      ...address,
      addressStatus: displayStatus,
    };
  });
}

/**
 * Determines address display status based on visibility settings
 * @param {string} visibilityValue - The address visibility value from migration data
 * @returns {string} - The corresponding address status
 */
function determineAddressDisplayStatus(visibilityValue) {
  if (!visibilityValue) {
    return ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;
  }

  const normalizedValue = visibilityValue.trim().toLowerCase();

  switch (normalizedValue) {
    case ADDRESS_VISIBILITY_OPTIONS.ALL:
      return ADDRESS_STATUS_TYPES.FULL_ADDRESS;
    case ADDRESS_VISIBILITY_OPTIONS.NONE:
      return ADDRESS_STATUS_TYPES.DONT_SHOW;
    default:
      return ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;
  }
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
    toShowPhone: inputMemberData.migrationData?.show_phone || '',
    optOut: inputMemberData.migrationData?.opted_out || false,
    url: uniqueUrl,
    showContactForm: true,
    bookingUrl: inputMemberData.migrationData?.schedule_code?.startsWith('http')
      ? inputMemberData.migrationData?.schedule_code
      : '',
    APIBookingUrl: inputMemberData.migrationData?.schedule_code,
    showABMP: inputMemberData.migrationData?.show_member_since || false,
    locHash: generateGeoHash(inputMemberData.addresses || []),
    ...DEFAULT_MEMBER_DISPLAY_SETTINGS,
  };
}
/**
 * Enriches member data with optional migration properties
 * @param {Object} options - The options object
 * @param {Object} options.memberDataToUpdate - Member data object to enhance
 * @param {Object} options.migrationData - Migration data containing optional properties
 * @param {boolean} [options.addInterests=true] - Whether to add interests to the member data
 * @param {Object} migrationData - Migration data containing optional properties
 */
function enrichWithMigrationData({ memberDataToUpdate, migrationData, addInterests = true }) {
  if (!migrationData) return;

  memberDataToUpdate.addressInfo = migrationData.addressinfo;

  if (migrationData.website) {
    memberDataToUpdate.website = migrationData.website;
    memberDataToUpdate.showWebsite = true;
  }

  if (addInterests && migrationData.interests) {
    memberDataToUpdate.areasOfPractices = processInterests(migrationData.interests);
  }
}
/**
 * Processes interests string into clean array
 * @param {string} interestsString - Comma-separated interests string
 * @returns {Array} - Array of trimmed, non-empty interests
 */
function processInterests(interestsString) {
  if (!interestsString) return [];

  return interestsString
    .split(',')
    .map(interest => interest.trim())
    .filter(interest => interest.length > 0);
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
