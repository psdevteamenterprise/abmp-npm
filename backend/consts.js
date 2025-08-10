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
  
  /**
   * Address display status types
   */
  const ADDRESS_STATUS_TYPES = {
    FULL_ADDRESS: 'full_address',
    STATE_CITY_ZIP: 'state_city_zip',
    DONT_SHOW: 'dont_show',
  };
  
  /**
   * Address visibility configuration options
   */
  const ADDRESS_VISIBILITY_OPTIONS = {
    ALL: 'all',
    NONE: 'none',
  };

  const COLLECTIONS = {
    MEMBERS_DATA: 'MembersDataLatest',
  };
  
  

   const MEMBER_ACTIONS = {
    UPDATE: 'update',
    NEW: 'new',
    DROP: 'drop',
    NONE: 'none'
};
  
  const PRECISION = 3;
  
  module.exports = {
    DEFAULT_MEMBER_DISPLAY_SETTINGS,
    ADDRESS_STATUS_TYPES,
    ADDRESS_VISIBILITY_OPTIONS,
    PRECISION,
    COLLECTIONS,
    MEMBER_ACTIONS,
  };
  