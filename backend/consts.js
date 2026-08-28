const PAC_API_URL = 'https://members.abmp.com/eweb/api/Wix';
const TEST_PAC_API_URL = 'https://members-test.abmp.com/eweb/api/Wix';
const BACKUP_API_URL = 'https://psdevteamenterpris.wixstudio.com/abmp-backup/_functions';
const SSO_TOKEN_AUTH_API_URL = 'https://members.professionalassistcorp.com/';

/**
 * Valid configuration keys for getSiteConfigs function
 * @readonly
 * @enum {string}
 */
const CONFIG_KEYS = {
  AUTOMATION_EMAIL_TRIGGER_ID: 'AUTOMATION_EMAIL_TRIGGER_ID',
  SITE_ASSOCIATION: 'SITE_ASSOCIATION',
  DEFAULT_PROFILE_SEO_DESCRIPTION: 'DEFAULT_PROFILE_SEO_DESCRIPTION',
  INTERESTS_API_URL: 'INTERESTS_API_URL',
  SITE_LOGO_URL: 'SITE_LOGO_URL',
  MEMBERS_EXTERNAL_PORTAL_URL: 'MEMBERS_EXTERNAL_PORTAL_URL',
  DEFAULT_PROFILE_IMAGE: 'DEFAULT_PROFILE_IMAGE',
  QA_ALLOW_ANY_MEMBER: 'QA_ALLOW_ANY_MEMBER',
};

const MAX__MEMBERS_SEARCH_RESULTS = 120;
const WIX_QUERY_MAX_LIMIT = 1000;

const GEO_HASH_PRECISION = 3;

const COMPILED_FILTERS_FIELDS = {
  COMPILED_STATE_LIST: 'COMPILED_STATE_LIST',
  COMPILED_AREAS_OF_PRACTICES: 'COMPILED_AREAS_OF_PRACTICES',
  COMPILED_STATE_CITY_MAP: 'COMPILED_STATE_CITY_MAP',
};
const MEMBERSHIPS_TYPES = {
  STUDENT: 'Student',
  PAC_STAFF: 'PAC STAFF',
};

/**
 * Possible outcomes of attempting to change a Wix member's login email during the sync.
 */
const LOGIN_EMAIL_SYNC_STATUS = {
  UPDATED: 'updated', // Wix login email successfully changed to the desired email
  FAILED: 'failed', // change failed -> keep the CMS login email unchanged and report for manual handling
  SKIPPED: 'skipped', // member has no wixMemberId, nothing to change
};

/**
 * Why a login was refused. Thrown by the data layer, recognised by the login layer, which turns it
 * into the ordinary error response rather than a 500.
 */
const LOGIN_REFUSAL_REASONS = {
  ASSOCIATION_MEMBERSHIP_EXPIRED: 'ASSOCIATION_MEMBERSHIP_EXPIRED',
};

module.exports = {
  CONFIG_KEYS,
  MAX__MEMBERS_SEARCH_RESULTS,
  WIX_QUERY_MAX_LIMIT,
  GEO_HASH_PRECISION,
  PAC_API_URL,
  TEST_PAC_API_URL,
  COMPILED_FILTERS_FIELDS,
  MEMBERSHIPS_TYPES,
  SSO_TOKEN_AUTH_API_URL,
  BACKUP_API_URL,
  LOGIN_EMAIL_SYNC_STATUS,
  LOGIN_REFUSAL_REASONS,
};
