const { encode } = require('ngeohash');

const { COLLECTIONS } = require('../public/consts');

const { CONFIG_KEYS, GEO_HASH_PRECISION } = require('./consts');
const { wixData } = require('./elevated-modules');
const { urlExists } = require('./members-data-methods');

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

const queryAllItems = async query => {
  console.log('start query');
  let oldResults = await query.find();
  console.log(`found items: ${oldResults.items.length}`);
  const allItems = oldResults.items;
  while (oldResults.hasNext()) {
    oldResults = await oldResults.next();
    allItems.push(...oldResults.items);
  }
  console.log(`all items: ${allItems.length}`);
  return allItems;
};
/**
 * Batches large arrays into smaller chunks for processing
 * @param {Array} array - Array to batch
 * @param {number} batchSize - Size of each batch
 * @returns {Array} - Array of batches
 */
const createBatches = (array, batchSize = 50) => {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
};

const generateGeoHash = addresses => {
  const geohash = addresses
    ?.filter(address => (isNaN(address?.latitude) && isNaN(address?.longitude) ? false : address))
    ?.map(address => encode(address.latitude, address.longitude, GEO_HASH_PRECISION));
  return geohash && geohash.length > 0 ? geohash : [];
};

/**
 * Validates if input is a non-empty array
 * @param {*} input - Input to validate
 * @returns {boolean} - True if input is a non-empty array
 */
const isValidArray = input => Array.isArray(input) && input.length > 0;

const normalizeUrlForComparison = url => {
  if (!url) return url;
  // Remove trailing pattern like "-1", "-2", etc.
  return url.toLowerCase().replace(/-\d+$/, '');
};

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

module.exports = {
  getSiteConfigs,
  retrieveAllItems,
  createBatches,
  generateGeoHash,
  isValidArray,
  normalizeUrlForComparison,
  queryAllItems,
  checkUrlUniqueness,
  formatDateToMonthYear,
  isStudent,
  getAddressDisplayOptions,
};
