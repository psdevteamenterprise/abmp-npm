const ELEVATED_QUERY_OPTIONS = {
  suppressAuth: true,
};

/**
 * Valid configuration keys for getSiteConfigs function
 * @readonly
 * @enum {string}
 */
const CONFIG_KEYS = {
  AUTOMATION_EMAIL_TRIGGER_ID: 'AUTOMATION_EMAIL_TRIGGER_ID',
  SITE_ASSOCIATION: 'SITE_ASSOCIATION',
};

module.exports = {
  ELEVATED_QUERY_OPTIONS,
  CONFIG_KEYS,
};
