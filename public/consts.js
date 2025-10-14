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
module.exports = {
  REGEX,
  COLLECTIONS,
  ADDRESS_STATUS_TYPES,
  DEFAULT_FILTER,
  DROPDOWN_OPTIONS,
  DEBOUNCE_DELAY,
};
