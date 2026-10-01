// Turns PAC's MigrateMembers feed into MembersDataLatest rows for a new association's site.
// Pure: no network, no Wix. Every rule the daily sync also applies is imported from the package
// itself so a first import cannot drift from what the sync writes afterwards.
//
// Scope is what PAC's ANP brief lists and what AHP actually stored: name, phones, addresses,
// contact email, memberships (member since), licenses. PAC's migrationData profile fields -
// image, website, booking link, about text, interests, display phone, opt-out, show-member-since -
// are not migrated; members fill those in on the site.

const {
  ASSOCIATION_EXPIRATION_FIELD,
  classifyAssociationExpiration,
  EXPIRATION_OUTCOMES,
} = require('../../backend/association-expiry');
const {
  MEMBER_ACTIONS,
  DEFAULT_MEMBER_DISPLAY_SETTINGS,
  PAC_ASSOCIATIONS,
} = require('../../backend/daily-pull/consts');
const {
  validateCoreMemberData,
  containsNonEnglish,
  createFullName,
  extractBaseUrl,
} = require('../../backend/daily-pull/utils');
const { generateGeoHash, isValidArray, extractUrlCounter } = require('../../backend/utils');
const { ADDRESS_STATUS_TYPES } = require('../../public/consts');
const { normalizeEmail } = require('../../public/Utils/sharedUtils');

const URL_FALLBACK = 'firstNameLastName';
const PAGE_SIZE = 1000;

const isSiteMember = (pacMember, association) =>
  Array.isArray(pacMember?.memberships) &&
  pacMember.memberships.some(membership => membership?.association === association);

// Same rule as filterLicensesByAssociation in the daily sync: keep this association's licenses
// and any that are not tagged with an association at all.
const filterLicenses = (licenses, association) =>
  (licenses || []).filter(license => !license?.association || license.association === association);

// Every address shows city/state/zip, as on AHP. PAC's per-address visibility (addressinfo) is
// kept on the row as-is but not applied.
const buildAddresses = addresses =>
  addresses.map((address, index) => ({
    ...address,
    key: address?.key || `address_${index}`,
    addressStatus: ADDRESS_STATUS_TYPES.STATE_CITY_ZIP,
  }));

// The slug before de-duplication: PAC's url as sent if it has one, otherwise the name with all
// whitespace removed, falling back to a fixed slug when that is empty or not plain ASCII.
const baseSlugFor = (pacUrl, fullName) => {
  const fromPac = (pacUrl || '').replace(/\s+/g, '');
  if (fromPac) return fromPac;
  const fromName = (fullName || '').replace(/\s+/g, '');
  return !fromName || containsNonEnglish(fromName) ? URL_FALLBACK : fromName;
};

/**
 * Assigns every row a slug unique case-insensitively, both within the batch and against slugs
 * already on the site. Within a group the first row (by memberId) keeps the bare slug and the
 * rest get -1, -2, ... - the scheme the daily sync uses.
 */
const assignUniqueUrls = (rows, existingUrls = []) => {
  const highestExisting = new Map();
  existingUrls.filter(Boolean).forEach(url => {
    const key = extractBaseUrl(url).toLowerCase();
    highestExisting.set(key, Math.max(highestExisting.get(key) ?? -1, extractUrlCounter(url), 0));
  });

  const groups = new Map();
  rows.forEach(row => {
    const key = row.url.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  groups.forEach((group, key) => {
    group.sort((a, b) => a.memberId - b.memberId);
    const start = highestExisting.has(key) ? highestExisting.get(key) + 1 : 0;
    const base = group[0].url;
    group.forEach((row, index) => {
      const counter = start + index;
      row.url = counter === 0 ? base : `${base}-${counter}`;
    });
  });
  return rows;
};

const toWixDate = date => (date ? { $date: date.toISOString() } : null);

/**
 * @param {Object} pacMember - one entry of MigrateMembers `results`
 * @param {Object} options
 * @param {string} options.association - the site's SITE_ASSOCIATION
 * @param {number} options.pageNumber
 * @returns {{row: Object, expirationOutcome: string}}
 */
const buildMemberRow = (pacMember, { association, pageNumber }) => {
  const firstName = pacMember.firstname?.trim() || '';
  const lastName = pacMember.lastname?.trim() || '';
  const fullName = createFullName(firstName, lastName);
  const email = normalizeEmail(pacMember.email);
  const addresses = isValidArray(pacMember.addresses) ? buildAddresses(pacMember.addresses) : [];
  const expiration = classifyAssociationExpiration(pacMember, association);

  const row = {
    memberId: pacMember.memberid,
    firstName,
    lastName,
    fullName,
    email,
    contactFormEmail: email,
    phones: pacMember.phones || [],
    action: pacMember.action,
    isVisible: pacMember.action !== MEMBER_ACTIONS.DROP,
    licenses: filterLicenses(pacMember.licenses, association),
    memberships: pacMember.memberships,
    [ASSOCIATION_EXPIRATION_FIELD]: toWixDate(expiration.date),
    pageNumber,
    // The daily sync's defaults for a new member.
    optOut: false,
    showABMP: false,
    ...DEFAULT_MEMBER_DISPLAY_SETTINGS,
    showContactForm: true,
    url: baseSlugFor(pacMember.url, fullName),
    locHash: generateGeoHash(pacMember.addresses || []),
    addresses,
    addressInfo: pacMember.migrationData?.addressinfo || {},
  };
  if (addresses.length) {
    row.addressDisplayOption = [{ key: addresses[0].key, isMain: true }];
  }
  return { row, expirationOutcome: expiration.outcome };
};

/**
 * Builds every row for one association and a report of what was decided.
 * @param {Array} pacMembers - MigrateMembers `results`
 * @param {Object} options
 * @param {string} options.association
 * @param {Array<string>} [options.existingUrls] - slugs already on the site, to avoid
 */
const buildImport = (pacMembers, { association, existingUrls = [] }) => {
  if (!Object.values(PAC_ASSOCIATIONS).includes(association)) {
    throw new Error(`Unknown association '${association}'`);
  }
  const siteMembers = pacMembers.filter(member => isSiteMember(member, association));

  const rejected = [];
  const seenIds = new Set();
  const rows = [];
  let urlsFromPac = 0;
  const expirationOutcomes = Object.fromEntries(
    Object.values(EXPIRATION_OUTCOMES).map(outcome => [outcome, 0])
  );

  siteMembers.forEach((pacMember, index) => {
    if (!validateCoreMemberData(pacMember)) {
      rejected.push({ memberid: pacMember?.memberid ?? null, reason: 'missing memberid/email' });
      return;
    }
    if (seenIds.has(String(pacMember.memberid))) {
      rejected.push({ memberid: pacMember.memberid, reason: 'duplicate memberid in feed' });
      return;
    }
    seenIds.add(String(pacMember.memberid));
    const { row, expirationOutcome } = buildMemberRow(pacMember, {
      association,
      pageNumber: Math.floor(index / PAGE_SIZE) + 1,
    });
    expirationOutcomes[expirationOutcome] += 1;
    if ((pacMember.url || '').trim()) urlsFromPac += 1;
    rows.push(row);
  });

  assignUniqueUrls(rows, existingUrls);
  const taken = new Set(existingUrls.filter(Boolean).map(url => url.toLowerCase()));
  rows.forEach(row => {
    const key = row.url.toLowerCase();
    if (taken.has(key)) throw new Error(`Slug collision after de-duplication: ${row.url}`);
    taken.add(key);
  });

  const count = predicate => rows.filter(predicate).length;
  const report = {
    association,
    feedMembers: pacMembers.length,
    siteMembers: siteMembers.length,
    rows: rows.length,
    rejected: rejected.length,
    byAction: rows.reduce((acc, row) => ({ ...acc, [row.action]: (acc[row.action] || 0) + 1 }), {}),
    visible: count(row => row.isVisible),
    expirationOutcomes,
    urls: {
      fromPac: urlsFromPac,
      fallbackSlug: count(row => row.url.toLowerCase().startsWith(URL_FALLBACK.toLowerCase())),
      withCounter: count(row => extractUrlCounter(row.url) > 0),
    },
    byMemberType: rows.reduce((acc, row) => {
      const type = row.memberships.find(m => m.association === association)?.membertype;
      return { ...acc, [type]: (acc[type] || 0) + 1 };
    }, {}),
    noAddresses: count(row => row.addresses.length === 0),
    // A 0/0 coordinate still geohashes (to "7zz"), exactly as the daily sync does; counted so it
    // is visible rather than silently shipped.
    zeroCoordinateAddresses: rows.reduce(
      (sum, row) => sum + row.addresses.filter(a => !a.latitude && !a.longitude).length,
      0
    ),
  };
  return { rows, rejected, report };
};

module.exports = {
  buildImport,
  buildMemberRow,
  assignUniqueUrls,
  baseSlugFor,
  buildAddresses,
  filterLicenses,
};
