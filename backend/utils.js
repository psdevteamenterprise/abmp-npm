const { encode } = require('ngeohash');

const { COLLECTIONS } = require('../public/consts');

const { CONFIG_KEYS, GEO_HASH_PRECISION } = require('./consts');
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

module.exports = {
  getSiteConfigs,
  retrieveAllItems,
  createBatches,
  generateGeoHash,
  isValidArray,
  normalizeUrlForComparison,
  queryAllItems,
};
