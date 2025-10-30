/**
 * Valid configuration keys for getSiteConfigs function
 * @readonly
 * @enum {string}
 */
const CONFIG_KEYS = {
  AUTOMATION_EMAIL_TRIGGER_ID: 'AUTOMATION_EMAIL_TRIGGER_ID',
  SITE_ASSOCIATION: 'SITE_ASSOCIATION',
};

const MAX__MEMBERS_SEARCH_RESULTS = 120;
const WIX_QUERY_MAX_LIMIT = 1000;

const TASKS_NAMES = {
  ScheduleDailyMembersDataSync: 'ScheduleDailyMembersDataSync',
  ScheduleMembersDataPerAction: 'ScheduleMembersDataPerAction',
  SyncMembers: 'SyncMembers',
};

const GEO_HASH_PRECISION = 3;

module.exports = {
  CONFIG_KEYS,
  MAX__MEMBERS_SEARCH_RESULTS,
  WIX_QUERY_MAX_LIMIT,
  TASKS_NAMES,
  GEO_HASH_PRECISION,
};
