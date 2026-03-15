const { updateWixMemberLoginEmail } = require('../members-area-methods');

const { MEMBER_ACTIONS } = require('./consts');

const isUpdatedMember = member => member.action !== MEMBER_ACTIONS.NONE;
const isSiteAssociatedMember = (member, siteAssociation) =>
  member.memberships.some(membership => membership.association === siteAssociation);

const changeWixMembersEmails = async toChangeWixMembersEmails => {
  console.log(
    `Changing login emails for ${toChangeWixMembersEmails.length} members with ids: [${toChangeWixMembersEmails.map(member => member.memberId).join(', ')}]`
  );
  return await Promise.all(
    toChangeWixMembersEmails.map(member => updateWixMemberLoginEmail(member, {}))
  );
};

const extractBaseUrl = url => {
  if (!url) return url;
  const urlParts = url.split('-');
  const lastSegment = urlParts[urlParts.length - 1];
  const isNumeric = /^\d+$/.test(lastSegment);
  if (isNumeric && urlParts.length > 1) {
    // Remove the numeric counter to get the base URL
    return urlParts.slice(0, -1).join('-');
  }
  // No counter found, return the URL as-is
  return url;
};
const incrementUrlCounter = (existingUrl, baseUrl) => {
  if (!existingUrl || !baseUrl) {
    return baseUrl;
  }
  // Normalize for comparison (case-insensitive)
  const normalizedExisting = existingUrl.toLowerCase();
  const normalizedBase = baseUrl.toLowerCase();

  if (
    normalizedExisting === normalizedBase ||
    normalizedExisting.startsWith(`${normalizedBase}-`)
  ) {
    console.log(
      `Found member with same url ${existingUrl} for baseUrl ${baseUrl}, increasing counter by 1`
    );
    const lastSegment = existingUrl.split('-').pop() || '0';
    const isNumeric = /^\d+$/.test(lastSegment);
    const lastCounter = isNumeric ? parseInt(lastSegment, 10) : 0;
    return `${baseUrl}-${lastCounter + 1}`;
  }

  // No conflict, return baseUrl with counter 1 to be safe
  return `${baseUrl}-1`;
};
/**
 * Validates core member data requirements
 * @param {Object} inputMemberData - Raw member data from API to validate
 * @returns {boolean} - True if all required fields are valid, false otherwise
 */
const validateCoreMemberData = inputMemberData => {
  // Check memberid
  if (!inputMemberData?.memberid) {
    console.warn('validateCoreMemberData: Missing required field - memberid is mandatory');
    return false;
  }

  // Check email
  if (
    !inputMemberData?.email ||
    typeof inputMemberData.email !== 'string' ||
    !inputMemberData.email.trim()
  ) {
    console.warn(
      'validateCoreMemberData: Missing required field - email (valid string) is mandatory'
    );
    return false;
  }

  // Check memberships
  if (
    !inputMemberData?.memberships ||
    !Array.isArray(inputMemberData.memberships) ||
    inputMemberData.memberships.length === 0
  ) {
    console.warn(
      'validateCoreMemberData: Missing required field - memberships (non-empty array) is mandatory'
    );
    return false;
  }

  return true;
};

const containsNonEnglish = str => /[^a-zA-Z0-9-]/.test(str); // if it contains any non-english characters or invalid URL chars, test1 is allowed, hyphens are allowed

/**
 * Creates a full name from first and last name components
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @returns {string} - Combined full name
 */
const createFullName = (firstName, lastName) => {
  const trimmedFirst = firstName?.trim() || '';
  const trimmedLast = lastName?.trim() || '';
  return `${trimmedFirst} ${trimmedLast}`.trim();
};

module.exports = {
  isUpdatedMember,
  isSiteAssociatedMember,
  changeWixMembersEmails,
  validateCoreMemberData,
  containsNonEnglish,
  createFullName,
  incrementUrlCounter,
  extractBaseUrl,
};
