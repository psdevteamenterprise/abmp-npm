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

const PAC_ASSOCIATIONS = {
  ABMP: 'ABMP',
  ASCP: 'ASCP',
  ANP: 'ANP',
  AHP: 'AHP',
};

module.exports = {
  MEMBER_ACTIONS,
  ADDRESS_VISIBILITY_OPTIONS,
  DEFAULT_MEMBER_DISPLAY_SETTINGS,
  PAC_ASSOCIATIONS,
};
