const REGEX = {
  NAME: /^[a-zA-Z\s'-]{2,}$/,
  MESSAGE: /^[A-Za-z0-9\s.,!?'"-]{2,}$/,
};

const COLLECTIONS = {
  MEMBERS_DATA: 'MembersDataLatest',
  CONTACT_US_SUBMISSIONS: 'contactUsSubmissions',
  SITE_CONFIGS: 'SiteConfigs',
};

const LIGHTBOX_NAMES = {
  SAVE_ALERT: 'Save Alert',
  LOGIN_ERROR_ALERT: 'loginError',
};

const ABMP_MEMBERS_HOME_URL = 'https://www.abmp.com/members';

const FREE_WEBSITE_TEXT_STATES = {
  ENABLED: 'This is the default and will auto-populate with the information entered on this page.',
  DISABLED: 'To deactivate, please opt in via Personal Details.',
};

const DEFAULT_BUSINESS_NAME_TEXT = 'Business name not provided';

const ADDRESS_STATUS_TYPES = {
  FULL_ADDRESS: 'full_address',
  STATE_CITY_ZIP: 'state_city_zip',
  DONT_SHOW: 'dont_show',
};

module.exports = {
  REGEX,
  COLLECTIONS,
  LIGHTBOX_NAMES,
  ABMP_MEMBERS_HOME_URL,
  FREE_WEBSITE_TEXT_STATES,
  DEFAULT_BUSINESS_NAME_TEXT,
  ADDRESS_STATUS_TYPES,
};
