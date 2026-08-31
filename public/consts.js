const REGEX = {
  NAME: /^[a-zA-Z\s'-]{2,}$/,
  MESSAGE: /^[A-Za-z0-9\s.,!?'"-]{2,}$/,
};

const COLLECTIONS = {
  MEMBERS_DATA: 'MembersDataLatest',
  CONTACT_US_SUBMISSIONS: 'contactUsSubmissions',
  SITE_CONFIGS: 'SiteConfigs',
  COMPILED_STATE_CITY_MAP: 'CompiledStateCityMap',
  STATE: 'State',
  INTERESTS: 'interests',
  STATE_CITY_MAP: 'City',
  UPDATED_LOGIN_EMAILS: 'updatedLoginEmails',
  QA_USERS: 'QA_Users', //Make QA users configurable per site
  BUTTON_CLICKS: 'ButtonClicks',
};

/**
 * Address display status types
 */
const ADDRESS_STATUS_TYPES = {
  FULL_ADDRESS: 'full_address',
  STATE_CITY_ZIP: 'state_city_zip',
  DONT_SHOW: 'dont_show',
};

const DEFAULT_FILTER = {
  skip: 0,
  limit: 12,
  practiceAreas: [],
  practiceAreasSearch: '',
  latitude: 0,
  longitude: 0,
  postalcode: null,
  state: [],
  stateSearch: '',
  citySearch: '',
  city: [],
  searchText: null,
};
const DROPDOWN_OPTIONS = {
  state: {
    selectedOptions: [],
    displayText: '',
  },
  city: {
    selectedOptions: [],
    displayText: '',
  },
  practiceAreas: {
    selectedOptions: [],
    displayText: '',
  },
};
const DEBOUNCE_DELAY = {
  searchTimeout: 1000,
  filterTimeout: 300,
  zeroTimeout: 0,
};
const MEMBERS_FIELDS = {
  _id: '_id',
  profileImage: 'profileImage',
  fullName: 'fullName',
  addresses: 'addresses',
  aboutService: 'aboutService',
  showBookingUrl: 'showBookingUrl',
  bookingUrl: 'bookingUrl',
  areasOfPractices: 'areasOfPractices',
  url: 'url',
  phones: 'phones',
  toShowPhone: 'toShowPhone',
  showContactForm: 'showContactForm',
  website: 'website',
  showWixUrl: 'showWixUrl',
  memberships: 'memberships',
  showWebsite: 'showWebsite',
  addressDisplayOption: 'addressDisplayOption',
  // Search projects only these fields, so the tier is invisible to the ordering code without it.
  memberUpdated: 'memberUpdated',
};

const LIGHTBOX_NAMES = {
  SAVE_ALERT: 'Save Alert',
  LOGIN_ERROR_ALERT: 'loginError',
  DELETE_CONFIRM: 'deleteConfirm',
  SELECT_BANNER_IMAGES: 'Select Banner Images',
  CONTACT_US: 'Contact Us',
  MAIN_ADDRESS_ERROR: 'mainAddressError',
};

const FREE_WEBSITE_TEXT_STATES = {
  ENABLED: 'This is the default and will auto-populate with the information entered on this page.',
  DISABLED: 'To deactivate, please opt in via Personal Details.',
};

const DEFAULT_BUSINESS_NAME_TEXT = 'Business name not provided';
const PAGES_PATHS = {
  PROFILE: 'profile',
  MEMBERS_FORM: 'directory-website-update',
};

module.exports = {
  REGEX,
  COLLECTIONS,
  ADDRESS_STATUS_TYPES,
  DEFAULT_FILTER,
  DROPDOWN_OPTIONS,
  DEBOUNCE_DELAY,
  MEMBERS_FIELDS,
  LIGHTBOX_NAMES,
  FREE_WEBSITE_TEXT_STATES,
  DEFAULT_BUSINESS_NAME_TEXT,
  PAGES_PATHS,
};
