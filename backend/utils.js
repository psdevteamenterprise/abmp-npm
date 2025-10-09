const { items: wixData } = require('@wix/data');

const { COLLECTIONS } = require('../public/consts');

const { ELEVATED_QUERY_OPTIONS, CONFIG_KEYS } = require('./consts');

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
  const siteConfigs = await wixData.get(
    COLLECTIONS.SITE_CONFIGS,
    'SINGLE_ITEM_ID',
    ELEVATED_QUERY_OPTIONS
  );
  if (configKey) {
    return siteConfigs[configKey];
  }
  return siteConfigs;
};

module.exports = {
  getSiteConfigs,
};
