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

module.exports = {
  getSiteConfigs,
  retrieveAllItems,
};
