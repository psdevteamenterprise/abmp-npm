const { auth } = require('@wix/essentials');
const { secrets } = require('@wix/secrets');
const { site } = require('@wix/urls');
const { encode } = require('ngeohash');

const { COLLECTIONS, ADDRESS_STATUS_TYPES } = require('../public/consts');
const { formatAddress, generateId, findMainAddress } = require('../public/Utils/sharedUtils');

const { CONFIG_KEYS, GEO_HASH_PRECISION, MEMBERSHIPS_TYPES } = require('./consts');
const { wixData } = require('./elevated-modules');
const elevatedGetSecretValue = auth.elevate(secrets.getSecretValue);

/**
 * Retrieves site configuration values from the database
 * @param {keyof typeof CONFIG_KEYS} [configKey] - The configuration key to retrieve
 * @returns {Promise<any>} The configuration value for the specified key, or all configs if no key provided
 * @example
 * // Get specific config
 * const emailTemplateId = await getSiteConfigs('AUTOMATION_EMAIL_TRIGGER_ID');
 *
 * // Get all configs
 * const allConfigs = await getSiteConfigs();
 */
const getSiteConfigs = async configKey => {
  if (configKey && !Object.values(CONFIG_KEYS).includes(configKey)) {
    throw new Error(
      `Invalid configKey: ${configKey}. Must be one of: ${Object.values(CONFIG_KEYS).join(', ')}`
    );
  }
  const siteConfigs = await wixData.get(COLLECTIONS.SITE_CONFIGS, 'SINGLE_ITEM_ID');
  if (configKey) {
    return siteConfigs[configKey];
  }
  return siteConfigs;
};

const retrieveAllItems = async collectionName => {
  let results = await wixData.query(collectionName).limit(1000).find();
  let allItems = results.items;
  while (results.hasNext()) {
    results = await results.next();
    allItems = allItems.concat(results.items);
  }
  return allItems;
};

/**
 * Format date to Month Year string
 * @param {string} dateString - The date string to format
 * @returns {string} Formatted date (e.g., "January 2024")
 */
function formatDateToMonthYear(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const options = { year: 'numeric', month: 'long' };
  return date.toLocaleDateString('en-US', options);
}

function hasStudentMembership({ member, checkAssociation = false, siteAssociation = null }) {
  const memberships = member?.memberships;
  if (!Array.isArray(memberships)) return false;

  return memberships.some(membership => {
    const isStudent = membership.membertype === MEMBERSHIPS_TYPES.STUDENT;
    const hasCorrectAssociation = !checkAssociation || membership.association === siteAssociation;
    return isStudent && hasCorrectAssociation;
  });
}

function isStudent(member) {
  return hasStudentMembership({ member, checkAssociation: false });
}

/**
 * POC: whether a member holds a NON-EXPIRED membership for the current site's
 * association (e.g. ABMP vs ASCP). Uses the per-membership `expiration` date
 * already present in the PAC feed — no new CMS field.
 *
 * This runs in JS (not the Wix query) on purpose: a member can hold several
 * memberships, so "the ABMP membership specifically is unexpired" requires
 * correlating association + expiration on the SAME array element, which a Wix
 * array query cannot express.
 *
 * POC decision: a membership with a missing/invalid `expiration` is treated as
 * NOT active (excluded). Flip `treatMissingExpirationAsActive` to be lenient.
 *
 * @param {Object} member
 * @param {string} siteAssociation - e.g. 'ABMP' | 'ASCP'
 * @param {Object} [options]
 * @param {Date} [options.now] - reference "today" (defaults to new Date())
 * @param {boolean} [options.treatMissingExpirationAsActive=false]
 * @returns {boolean}
 */
function hasActiveSiteMembership(
  member,
  siteAssociation,
  { now = new Date(), treatMissingExpirationAsActive = false } = {}
) {
  const memberships = member?.memberships;
  if (!Array.isArray(memberships)) return false;

  return memberships.some(membership => {
    if (membership.association !== siteAssociation) return false;
    if (!membership.expiration) return treatMissingExpirationAsActive;
    const expiration = new Date(membership.expiration);
    if (isNaN(expiration.getTime())) return treatMissingExpirationAsActive;
    return expiration.getTime() >= now.getTime();
  });
}

function isPAC_STAFF(member) {
  return Boolean(
    member?.memberships?.some(membership => membership.membertype === MEMBERSHIPS_TYPES.PAC_STAFF)
  );
}
/**
 * Get address display options for member
 * @param {Object} member - The member object
 * @returns {Array} Address display options
 */
function getAddressDisplayOptions(member) {
  const addresses = member.addresses || [];
  const displayOptions = member.addressDisplayOption || [];
  if (addresses.length === 1 && addresses[0].key) {
    return [{ key: addresses[0].key, isMain: true }];
  }
  return displayOptions;
}
function getMoreAddressesToDisplay(addresses = [], addressDisplayOption = []) {
  const visible = addresses.filter(addr => addr.addressStatus !== ADDRESS_STATUS_TYPES.DONT_SHOW);
  if (visible.length < 2) {
    return [];
  }
  const mainAddress = findMainAddress(addressDisplayOption, addresses);
  const remainingAddressesToFormat = mainAddress
    ? visible.filter(addr => addr?.key !== mainAddress.key)
    : visible;

  return remainingAddressesToFormat
    .map(addr => {
      const addressString = formatAddress(addr);
      return addressString ? { _id: generateId(), address: addressString } : null;
    })
    .filter(Boolean);
}
const getAllItems = async querySearchResult => {
  let oldResults = querySearchResult;
  console.log(`found items: ${oldResults.items.length}`);
  const allItems = oldResults.items;
  while (oldResults.hasNext()) {
    oldResults = await oldResults.next();
    allItems.push(...oldResults.items);
  }
  console.log(`all items count : ${allItems.length}`);
  return allItems;
};
const searchAllItems = async searchQuery => {
  console.log('start search');
  const searchResults = await searchQuery.run();
  return getAllItems(searchResults);
};

const queryAllItems = async query => {
  console.log('start query');
  const queryResults = await query.find();
  return getAllItems(queryResults);
};
/**
 * Chunks large arrays into smaller chunks for processing
 * @param {Array} array - Array to chunk
 * @param {number} chunkSize - Size of each chunk
 * @returns {Array} - Array of chunks
 */
const chunkArray = (array, chunkSize = 50) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

const generateGeoHash = addresses => {
  const geohash = addresses
    ?.filter(address => (isNaN(address?.latitude) && isNaN(address?.longitude) ? false : address))
    ?.map(address => encode(address.latitude, address.longitude, GEO_HASH_PRECISION));
  return geohash && geohash.length > 0 ? geohash : [];
};

/**
 * Validates if input is a non-empty array
 * @param {*} input - Input to validate
 * @returns {boolean} - True if input is a non-empty array
 */
const isValidArray = input => Array.isArray(input) && input.length > 0;

const normalizeUrlForComparison = url => {
  if (!url) return url;
  // Remove trailing pattern like "-1", "-2", etc.
  return url.toLowerCase().replace(/-\d+$/, '');
};

const extractUrlCounter = url => {
  if (!url) return -1;
  const lastSegment = url.split('-').pop() || '0';
  return /^\d+$/.test(lastSegment) ? parseInt(lastSegment, 10) : -1;
};

const sortByUrlCounterDescending = (a, b) => extractUrlCounter(b.url) - extractUrlCounter(a.url);

async function getSecret(secretKey) {
  return (await elevatedGetSecretValue(secretKey)).value;
}

async function getSiteBaseUrl() {
  try {
    const result = await site.listPublishedSiteUrls({
      filters: { primary: true },
    });
    const baseUrl = result.urls[0].url;
    if (!baseUrl) {
      throw new Error('No Base URL Found');
    }
    return baseUrl;
  } catch (error) {
    throw new Error(`Failed to get site base URL: ${error?.message || error}`);
  }
}

function encodeXml(value) {
  if (!value) return '';
  return (
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // eslint-disable-next-line no-useless-escape
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&apos;')
  );
}

function formatDateOnly(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

const runIf = (condition, asyncFn) => (condition ? asyncFn() : Promise.resolve(null));

/**
 * Whether an error looks like a transient network failure that is safe to retry,
 * e.g. undici's generic "fetch failed" thrown by the Wix SDKs, connection resets
 * or DNS hiccups under heavy load.
 * @param {Error} error
 * @returns {boolean}
 */
const isTransientNetworkError = error => {
  const message = `${error?.message || ''} ${error?.cause?.message || ''} ${error?.code || ''} ${error?.cause?.code || ''}`;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|EPIPE|UND_ERR|socket hang up|network error/i.test(
    message
  );
};

/**
 * Runs an async operation, retrying with exponential backoff when it fails with a
 * transient network error. Non-transient errors are rethrown immediately.
 * @param {Function} operation - Async function to run
 * @param {Object} [options]
 * @param {number} [options.retries=2] - Maximum number of retries after the first attempt
 * @param {number} [options.baseDelayMs=500] - Delay before the first retry, doubled each retry
 * @returns {Promise<any>} - The operation's resolved value
 */
const withTransientErrorRetry = async (operation, { retries = 2, baseDelayMs = 500 } = {}) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !isTransientNetworkError(error)) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** attempt;
      console.warn(
        `Transient network error (attempt ${attempt + 1}/${retries + 1}): ${error.message}. Retrying in ${delayMs}ms`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};

module.exports = {
  getSiteConfigs,
  retrieveAllItems,
  chunkArray,
  generateGeoHash,
  isValidArray,
  normalizeUrlForComparison,
  sortByUrlCounterDescending,
  extractUrlCounter,
  queryAllItems,
  formatDateToMonthYear,
  isStudent,
  hasStudentMembership,
  hasActiveSiteMembership,
  getAddressDisplayOptions,
  getSecret,
  getSiteBaseUrl,
  encodeXml,
  formatDateOnly,
  getMoreAddressesToDisplay,
  isPAC_STAFF,
  searchAllItems,
  runIf,
  isTransientNetworkError,
  withTransientErrorRetry,
};
