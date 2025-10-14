const REGEX = {
  NAME: /^[a-zA-Z\s'-]{2,}$/,
  MESSAGE: /^[A-Za-z0-9\s.,!?'"-]{2,}$/,
};

const COLLECTIONS = {
  MEMBERS_DATA: 'MembersDataLatest',
  CONTACT_US_SUBMISSIONS: 'contactUsSubmissions',
  SITE_CONFIGS: 'SiteConfigs',
};

module.exports = {
  REGEX,
  COLLECTIONS,
};
