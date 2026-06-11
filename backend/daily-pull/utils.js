const { LOGIN_EMAIL_SYNC_STATUS } = require('../consts');
const { updateWixMemberLoginEmail } = require('../members-area-methods');
const { extractUrlCounter } = require('../utils');

const { MEMBER_ACTIONS } = require('./consts');

const isUpdatedMember = member => member.action !== MEMBER_ACTIONS.NONE;
const isSiteAssociatedMember = (member, siteAssociation) =>
  member.memberships.some(membership => membership.association === siteAssociation);

/**
 * Attempts to change Wix login emails for the given members and returns one structured
 * outcome per member (see updateWixMemberLoginEmail). Never throws for an individual member.
 * @param {Array} toChangeWixMembersEmails
 * @returns {Promise<Array>} outcomes
 */
const changeWixMembersEmails = async toChangeWixMembersEmails => {
  console.log(
    `[loginEmailSync] changing login emails for ${toChangeWixMembersEmails.length} members with ids: [${toChangeWixMembersEmails.map(member => member.memberId).join(', ')}]`
  );
  const outcomes = await Promise.all(
    toChangeWixMembersEmails.map(member => updateWixMemberLoginEmail(member))
  );
  const summary = outcomes.reduce((acc, outcome) => {
    acc[outcome.status] = (acc[outcome.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`[loginEmailSync] results summary: ${JSON.stringify(summary)}`);
  return outcomes;
};

/**
 * Summarizes login-email sync outcomes for manual handling via the task result.
 * Pure function so it can be unit-tested without Wix.
 * @param {Array} outcomes - from updateWixMemberLoginEmail / changeWixMembersEmails
 * @returns {{ failedMemberIds: Set, failures: Array }} set of failed memberIds (whose CMS login
 *   email must be left unchanged) and the failure records to surface in the task result
 */
const summarizeLoginEmailOutcomes = (outcomes = []) => {
  const failedMemberIds = new Set();
  const failures = [];
  outcomes.forEach(outcome => {
    if (outcome.status === LOGIN_EMAIL_SYNC_STATUS.FAILED) {
      failedMemberIds.add(outcome.memberId);
      failures.push({
        memberId: outcome.memberId,
        wixMemberId: outcome.wixMemberId,
        desiredEmail: outcome.desiredEmail,
        error: outcome.error || 'unknown error',
      });
    }
  });
  return { failedMemberIds, failures };
};

const extractBaseUrl = url => {
  if (!url) return url;
  const lastCounter = extractUrlCounter(url);
  if (lastCounter > 0) {
    // Remove the numeric counter to get the base URL
    return url.split('-').slice(0, -1).join('-');
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
    const lastCounter = Math.max(0, extractUrlCounter(existingUrl));
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
  summarizeLoginEmailOutcomes,
  validateCoreMemberData,
  containsNonEnglish,
  createFullName,
  incrementUrlCounter,
  extractBaseUrl,
};
