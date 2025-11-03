const { COLLECTIONS } = require('../public/consts');

const { CONFIG_KEYS } = require('./consts');
const { wixData } = require('./elevated-modules');

/**
 * Retrieves site configuration values from the database
 * @param {string} [configKey] - The configuration key to retrieve. Must be one of:
 *   - 'AUTOMATION_EMAIL_TRIGGER_ID' - Email template ID for triggered emails
 *   - 'SITE_ASSOCIATION' - Site association configuration
 * @returns {Promise<any>} The configuration value for the specified key, or all configs if no key provided
 * @example
 * // Get specific config
 * const emailTemplateId = await getSiteConfigs('AUTOMATION_EMAIL_TRIGGER_ID');
 *
 * // Get all configs
 * const allConfigs = await getSiteConfigs();
 */
const getSiteConfigs = async configKey => {
  if (configKey && !Object.values(CONFIG_KEYS).includes(configKey)) {
    throw new Error(
      `Invalid configKey: ${configKey}. Must be one of: ${Object.values(CONFIG_KEYS).join(', ')}`
    );
  }
  const siteConfigs = await wixData.get(COLLECTIONS.SITE_CONFIGS, 'SINGLE_ITEM_ID');
  if (configKey) {
    return siteConfigs[configKey];
  }
  return siteConfigs;
};

const retrieveAllItems = async collectionName => {
  let results = await wixData.query(collectionName).limit(1000).find();
  let allItems = results.items;
  while (results.hasNext()) {
    results = await results.next();
    allItems = allItems.concat(results.items);
  }
  return allItems;
};

/**
 * Format date to Month Year string
 * @param {string} dateString - The date string to format
 * @returns {string} Formatted date (e.g., "January 2024")
 */
function formatDateToMonthYear(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const options = { year: 'numeric', month: 'long' };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Check if member is a student
 * @param {Object} member - The member object
 * @returns {boolean} True if member has student membership
 */
function isStudent(member) {
  const memberships = member?.memberships;
  if (!Array.isArray(memberships)) return false;

  return memberships.some(membership => membership.membertype === 'student');
}

/**
 * Get address display options for member
 * @param {Object} member - The member object
 * @returns {Array} Address display options
 */
function getAddressDisplayOptions(member) {
  const addresses = member.addresses || [];
  const displayOptions = member.addressDisplayOption || [];
  if (addresses.length === 1 && addresses[0].key) {
    return [{ key: addresses[0].key, isMain: true }];
  }
  return displayOptions;
}

module.exports = {
  getSiteConfigs,
  retrieveAllItems,
  formatDateToMonthYear,
  isStudent,
  getAddressDisplayOptions,
};
