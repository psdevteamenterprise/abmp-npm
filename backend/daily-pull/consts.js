const PAC_API_URL = 'https://members.abmp.com/eweb/api/Wix';

const MEMBER_ACTIONS = {
  UPDATE: 'update',
  NEW: 'new',
  DROP: 'drop',
  NONE: 'none',
};

/**
 * Address visibility configuration options
 */
const ADDRESS_VISIBILITY_OPTIONS = {
  ALL: 'all',
  NONE: 'none',
};

/**
 * Default display settings for member profiles
 */
const DEFAULT_MEMBER_DISPLAY_SETTINGS = {
  showLicenseNo: true,
  showName: true,
  showBookingUrl: false,
  showWebsite: false,
  showWixUrl: true,
};

module.exports = {
  MEMBER_ACTIONS,
  ADDRESS_VISIBILITY_OPTIONS,
  DEFAULT_MEMBER_DISPLAY_SETTINGS,
  PAC_API_URL,
};
