const {
    ADDRESS_STATUS_TYPES,
    ADDRESS_VISIBILITY_OPTIONS,
  } = require('./consts.js');
  
  /**
   * Safely adds optional properties from source to target object
   * @param {Object} targetObject - Object to add properties to
   * @param {Object} sourceObject - Object to get properties from
   * @param {string} sourcePropertyKey - Key to get from source
   * @param {string} targetPropertyKey - Key to set on target (defaults to sourcePropertyKey)
   */
  const addOptionalProperty = (
    targetObject,
    sourceObject,
    sourcePropertyKey,
    targetPropertyKey = sourcePropertyKey
  ) => {
    if (sourceObject && sourceObject[sourcePropertyKey]) {
      targetObject[targetPropertyKey] = sourceObject[sourcePropertyKey];
    }
  };
  
  /**
   * Safely trims a string value with fallback
   * @param {string} value - The string to trim
   * @param {string} fallback - Fallback value if input is invalid
   * @returns {string} - The trimmed string or fallback
   */
  const safeTrim = (value, fallback = '') => {
    return value ? value.toString().trim() : fallback;
  };
  
  /**
   * Determines address display status based on visibility settings
   * @param {string} visibilityValue - The address visibility value from migration data
   * @returns {string} - The corresponding address status
   */
  const determineAddressDisplayStatus = (visibilityValue) => {
    if (!visibilityValue) {
      return ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;
    }
  
    const normalizedValue = visibilityValue.trim().toLowerCase();
  
    switch (normalizedValue) {
      case ADDRESS_VISIBILITY_OPTIONS.ALL:
        return ADDRESS_STATUS_TYPES.FULL_ADDRESS;
      case ADDRESS_VISIBILITY_OPTIONS.NONE:
        return ADDRESS_STATUS_TYPES.DONT_SHOW;
      default:
        return ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;
    }
  };
  
  /**
   * Validates if input is a non-empty array
   * @param {*} input - Input to validate
   * @returns {boolean} - True if input is a non-empty array
   */
  const isValidArray = (input) => {
    return Array.isArray(input) && input.length > 0;
  };
  
  /**
   * Processes interests string into clean array
   * @param {string} interestsString - Comma-separated interests string
   * @returns {Array} - Array of trimmed, non-empty interests
   */
  const processInterests = (interestsString) => {
    if (!interestsString) return [];
  
    return interestsString
      .split(',')
      .map((interest) => interest.trim())
      .filter((interest) => interest.length > 0);
  };
  
  /**
   * Creates a full name from first and last name components
   * @param {string} firstName - First name
   * @param {string} lastName - Last name
   * @returns {string} - Combined full name
   */
  const createFullName = (firstName, lastName) => {
    const trimmedFirst = firstName?.trim() || '';
    const trimmedLast = lastName?.trim() || '';
    return `${trimmedFirst} ${trimmedLast}`.trim();
  };

  function generateGeoHash(addresses) {
    const geohash = addresses
      ?.filter((address) =>
        isNaN(address?.latitude) && isNaN(address?.longitude) ? false : address
      )
      ?.map((address) =>
        ngeohash.encode(address.latitude, address.longitude, PRECISION)
      );
    return geohash && geohash.length > 0 ? geohash : [];
  }
  
  module.exports = {
    addOptionalProperty,
    safeTrim,
    determineAddressDisplayStatus,
    isValidArray,
    processInterests,
    createFullName,
    generateGeoHash,
  };
  