/**
 * Valid configuration keys for getSiteConfigs function
 * @readonly
 * @enum {string}
 */
const CONFIG_KEYS = {
  AUTOMATION_EMAIL_TRIGGER_ID: 'AUTOMATION_EMAIL_TRIGGER_ID',
  SITE_ASSOCIATION: 'SITE_ASSOCIATION',
};

const PRECISION = 3;
const MAX__MEMBERS_SEARCH_RESULTS = 120;
const WIX_QUERY_MAX_LIMIT = 1000;

module.exports = {
  CONFIG_KEYS,
  PRECISION,
  MAX__MEMBERS_SEARCH_RESULTS,
  WIX_QUERY_MAX_LIMIT,
};
