import { generateGeoHash } from './utils.js';
import {
  ADDRESS_STATUS_TYPES,
  DEFAULT_MEMBER_DISPLAY_SETTINGS,
  MEMBER_ACTIONS,
} from './consts.js';
import {
  determineAddressDisplayStatus,
  isValidArray,
  processInterests,
  createFullName,
} from './utils.js';
import { findMemberById } from './utils.js';

/**
 * Validates core member data requirements
 * @param {Object} inputMemberData - Raw member data from API to validate
 * @returns {boolean} - True if all required fields are valid, false otherwise
 */
const validateCoreMemberData = (inputMemberData) => {
  // Check memberid
  if (!inputMemberData?.memberid) {
    console.warn('validateCoreMemberData: Missing required field - memberid is mandatory');
    return false;
  }

  // Check email
  if (!inputMemberData?.email || 
      typeof inputMemberData.email !== 'string' || 
      !inputMemberData.email.trim()) {
    console.warn('validateCoreMemberData: Missing required field - email (valid string) is mandatory');
    return false;
  }

  // Check memberships
  if (!inputMemberData?.memberships || !Array.isArray(inputMemberData.memberships) || inputMemberData.memberships.length === 0) {
    console.warn('validateCoreMemberData: Missing required field - memberships (non-empty array) is mandatory');
    return false;
  }

  return true;
};

/**
 * Creates base member data structure with core properties
 * @param {Object} inputMemberData - Raw member data from API
 * @param {Object} existingDbMember - Existing member data from database
 * @param {number} currentPageNumber - Current page number being processed
 * @returns {Object|null} - Structured base member data or null if required fields are missing
 */
const createCoreMemberData = (
  inputMemberData,
  existingDbMember,
  currentPageNumber
) => {
  // Validate required fields
  if (!validateCoreMemberData(inputMemberData)) {
    return null;
  }

  const sanitizedFirstName = inputMemberData.firstname?.trim() || '';
  const sanitizedLastName = inputMemberData.lastname?.trim() || '';
  const bookingUrl = inputMemberData.migrationData?.schedule_code?.startsWith('http') ? inputMemberData.migrationData?.schedule_code : '';
  return {
    ...existingDbMember,
    memberId: inputMemberData.memberid,
    firstName: sanitizedFirstName,
    lastName: sanitizedLastName,
    fullName: createFullName(sanitizedFirstName, sanitizedLastName),
    email: inputMemberData.email.trim(),
    phones: inputMemberData.phones || [],
    toShowPhone: inputMemberData.migrationData?.show_phone || '',
    action: inputMemberData.action,
    licenses: inputMemberData.licenses || [],
    memberships: inputMemberData.memberships,
    pageNumber: currentPageNumber,
    optOut: inputMemberData.migrationData?.opted_out || false,
    showABMP: inputMemberData.migrationData?.show_member_since || false,
    locHash: generateGeoHash(inputMemberData.addresses || []),
    ...DEFAULT_MEMBER_DISPLAY_SETTINGS,
    isVisible: inputMemberData.action !== MEMBER_ACTIONS.DROP,
    url: inputMemberData.url,
    bookingUrl,
    APIBookingUrl: inputMemberData.migrationData?.schedule_code,//keeping it as a ref if in future they want original
  };
};

/**
 * Enriches member data with optional migration properties
 * @param {Object} memberDataToUpdate - Member data object to enhance
 * @param {Object} migrationData - Migration data containing optional properties
 */
const enrichWithMigrationData = (memberDataToUpdate, migrationData) => {
  if (!migrationData) return;

  memberDataToUpdate.logoImage = migrationData.logo_url;
  memberDataToUpdate.aboutYouHtml = migrationData.detailtext;
  memberDataToUpdate.addressInfo = migrationData.addressinfo;
  

  if (migrationData.website) {
    memberDataToUpdate.website = migrationData.website;
    memberDataToUpdate.showWebsite = true;
  }

  if (migrationData.interests) {
    memberDataToUpdate.areasOfPractices = processInterests(
      migrationData.interests
    );
  }
};

/**
 * Processes multiple addresses with their display statuses
 * @param {Array} addressesList - Array of address objects
 * @param {Object} displayConfiguration - Address display configuration
 * @returns {Array} - Processed addresses with status information
 */
const processAddressesWithStatus = (
  addressesList,
  displayConfiguration = {}
) => {
  if (!isValidArray(addressesList)) {
    return [];
  }

  return addressesList.map((address) => {
    const displayStatus = displayConfiguration[address.key]
      ? determineAddressDisplayStatus(displayConfiguration[address.key])
      : ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;

    return {
      ...address,
      addressStatus: displayStatus,
    };
  });
};

/**
 * Processes and adds address data with proper status
 * @param {Object} memberDataToUpdate - Member data object to enhance
 * @param {Array} addressesList - Array of address objects
 * @param {Object} addressDisplayInfo - Address visibility configuration
 */
const enrichWithAddressData = (
  memberDataToUpdate,
  addressesList,
  addressDisplayInfo
) => {
  if (isValidArray(addressesList)) {
    memberDataToUpdate.addresses = processAddressesWithStatus(
      addressesList,
      addressDisplayInfo
    );
  }
};

/**
 * Generates complete updated member data by combining existing and migration data
 * @param {Object} inputMemberData - Raw member data from API
 * @param {number} currentPageNumber - Current page number being processed
 * @returns {Promise<Object|null>} - Complete updated member data or null if validation fails
 */
async function generateUpdatedMemberData (
  inputMemberData,
  currentPageNumber,
  isVelo = false
) {
  if (!validateCoreMemberData(inputMemberData)) {
    throw new Error('Invalid member data: memberid, email (valid string), and memberships (array) are required');
  }

  try {

    const existingDbMember = isVelo? await findMemberById(inputMemberData.memberid) : {};
    const updatedMemberData = createCoreMemberData(
      inputMemberData,
      existingDbMember,
      currentPageNumber
    );

    // If createCoreMemberData returns null due to validation failure, return null
    if (!updatedMemberData) {
      return null;
    }

    enrichWithMigrationData(updatedMemberData, inputMemberData.migrationData);

    enrichWithAddressData(
      updatedMemberData,
      inputMemberData.addresses,
      inputMemberData.migrationData?.addressinfo
    );

    return updatedMemberData;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  validateCoreMemberData,
  createCoreMemberData,
  enrichWithMigrationData,
  processAddressesWithStatus,
  enrichWithAddressData,
  generateUpdatedMemberData,
};


