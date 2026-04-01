const { ADDRESS_STATUS_TYPES, DEBOUNCE_DELAY } = require('../consts.js');

const checkAddressIsVisible = (addresses = []) => {
  // ensure we always get an array
  if (!Array.isArray(addresses)) return [];

  return addresses.filter(
    val => val.addressStatus === undefined || val.addressStatus !== ADDRESS_STATUS_TYPES.DONT_SHOW
  );
};

//Formats an array of practice areas, showing as many as fit within 70 characters
function formatPracticeAreasForDisplay(areaOfPractices = []) {
  // always return a string
  if (!Array.isArray(areaOfPractices) || areaOfPractices.length === 0) {
    return '';
  }

  // Filter out null/undefined/empty
  const validAreas = areaOfPractices.filter(
    area => area !== null && area !== undefined && area !== ''
  );

  if (validAreas.length === 0) {
    return '';
  }

  if (validAreas.length === 1) {
    return validAreas[0].length > 70 ? validAreas[0].substring(0, 67) + '...' : validAreas[0];
  }

  // build up to 70-char string
  let current = '';
  const visible = [];
  for (const item of validAreas) {
    const sep = visible.length ? ', ' : '';
    const next = current + sep + item;
    if (next.length > 70) break;
    visible.push(item);
    current = next;
  }

  // if nothing fit, at least show the first (truncated)
  if (visible.length === 0) {
    const first = validAreas[0];
    return first.length > 67 ? first.substring(0, 67) + '...' : first;
  }

  const remaining = validAreas.length - visible.length;
  return remaining > 0 ? `${visible.join(', ')}, +${remaining} Techniques` : visible.join(', ');
}

function debouncedFunction({ func, debounceTimeout, timeoutType, args }) {
  return new Promise(resolve => {
    debounceTimeout[timeoutType] = setTimeout(async () => {
      try {
        const response = await func(args);
        resolve({ success: true, response });
      } catch (error) {
        console.error('Error updating results:', error);
        resolve({ success: false, error });
      }
    }, DEBOUNCE_DELAY[timeoutType]);
  });
}

const isValidLocation = location => location.latitude && location.longitude;

/**
 * @param {Array} addressDisplayOption
 * @param {Array} addresses
 * @param {Object|boolean} [options] - Optional. Pass { requireValidCoordinates: true } for home search/distance; omit or false for profile display.
 */
function findMainAddress(addressDisplayOption = [], addresses = [], options = {}) {
  const requireValidCoordinates =
    typeof options === 'boolean' ? options : Boolean(options?.requireValidCoordinates);
  const optionsArr = Array.isArray(addressDisplayOption) ? addressDisplayOption : [];
  const mainOpt = optionsArr.find(opt => opt.isMain);
  if (mainOpt) {
    const mainAddr = addresses.find(
      addr =>
        addr.key === mainOpt.key &&
        addr.addressStatus !== ADDRESS_STATUS_TYPES.DONT_SHOW &&
        (!requireValidCoordinates || isValidLocation(addr))
    );
    if (mainAddr) {
      return mainAddr;
    }
  }
  const visibleAddresses = addresses.filter(
    addr =>
      addr.addressStatus !== ADDRESS_STATUS_TYPES.DONT_SHOW &&
      (!requireValidCoordinates || isValidLocation(addr))
  );
  if (visibleAddresses.length) {
    return visibleAddresses[0];
  }
  return '';
}
function formatAddress(item) {
  if (!item) return '';
  let addressParts = [];
  const limitedPostalCode = (item.postalcode && String(item.postalcode).slice(0, 5)) || ''; //show only 5 digits to not show full user address
  const status = item.addressStatus;
  switch (status) {
    case ADDRESS_STATUS_TYPES.FULL_ADDRESS:
      addressParts = [item.line1, item.line2, item.city, item.state, limitedPostalCode];
      break;
    case ADDRESS_STATUS_TYPES.STATE_CITY_ZIP:
      addressParts = [item.city, item.state, limitedPostalCode];
      break;
    default:
      if (status === ADDRESS_STATUS_TYPES.DONT_SHOW) return '';
      // Legacy addresses may have no addressStatus; show city/state/zip by default
      addressParts = [item.city, item.state, limitedPostalCode];
      break;
  }
  return addressParts.filter(Boolean).join(', ');
}

/**
 * @param {Array} addressDisplayOption
 * @param {Array} addresses
 * @param {Object|boolean} [options] - Optional. Pass { requireValidCoordinates: true } for home search/distance; omit or false for profile display.
 */
function getMainAddress(addressDisplayOption = [], addresses = [], options = {}) {
  const mainAddr = findMainAddress(addressDisplayOption, addresses, options);
  if (mainAddr) {
    return formatAddress(mainAddr);
  }
  return '';
}
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function calculateDistance(location1, location2) {
  if (!isValidLocation(location1) || !isValidLocation(location2)) {
    return null;
  }

  // Earth's radius in miles
  const earthRadius = 3958.8;

  // Convert latitude and longitude from degrees to radians
  const latRad1 = toRadians(location1.latitude);
  const lonRad1 = toRadians(location1.longitude);
  const latRad2 = toRadians(location2.latitude);
  const lonRad2 = toRadians(location2.longitude);

  // Differences in coordinates
  const latDiff = latRad2 - latRad1;
  const lonDiff = lonRad2 - lonRad1;

  // Haversine formula
  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(latRad1) * Math.cos(latRad2) * Math.sin(lonDiff / 2) * Math.sin(lonDiff / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = earthRadius * c;

  return distance;
}

/**
 * Generate a unique ID
 * @returns {string} Unique identifier
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function isWixHostedImage(imageUrl) {
  return (
    imageUrl?.trim() &&
    (imageUrl?.startsWith('wix:') || imageUrl?.startsWith('https://static.wixstatic.com'))
  );
}

/** Web URLs only: bare hostnames get https:// so they are not treated as site-relative paths. */
function normalizeExternalUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

module.exports = {
  checkAddressIsVisible,
  formatPracticeAreasForDisplay,
  debouncedFunction,
  findMainAddress,
  getMainAddress,
  shuffleArray,
  calculateDistance,
  toRadians,
  generateId,
  formatAddress,
  isWixHostedImage,
  normalizeExternalUrl,
};
