// The per-association expiry rule, shared by the sync, the backfill and the read paths so they
// cannot drift on what "expired" means. Deliberately free of Wix imports.

const ASSOCIATION_EXPIRATION_FIELD = 'associationExpiration';
const ASSOCIATION_TIME_ZONE = 'America/Denver';

const EXPIRATION_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

const EXPIRATION_OUTCOMES = {
  RESOLVED: 'resolved',
  NO_SITE_ASSOCIATION: 'noSiteAssociation',
  NO_MEMBERSHIP_FOR_ASSOCIATION: 'noMembershipForAssociation',
  MISSING_EXPIRATION: 'missingExpiration',
  UNREADABLE_EXPIRATION: 'unreadableExpiration',
};

// PAC sends zoneless ISO strings, which `new Date()` would read as local time - the same feed
// would then mean different days depending on where it ran.
const parseExpirationToUtcDate = expiration => {
  if (typeof expiration !== 'string') return null;

  const match = EXPIRATION_DATE_PATTERN.exec(expiration.trim());
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC rolls 2026-02-31 forward to 3 March rather than rejecting it.
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  return isRealDate ? parsed : null;
};

// outcome explains a null date for the backfill report: no entry for this association is a very
// different thing from a malformed one.
const classifyAssociationExpiration = (member, siteAssociation) => {
  if (!siteAssociation) {
    return { date: null, outcome: EXPIRATION_OUTCOMES.NO_SITE_ASSOCIATION };
  }

  const memberships = Array.isArray(member?.memberships) ? member.memberships : [];
  const membership = memberships.find(entry => entry?.association === siteAssociation);

  if (!membership) {
    return { date: null, outcome: EXPIRATION_OUTCOMES.NO_MEMBERSHIP_FOR_ASSOCIATION };
  }

  const raw = membership.expiration;
  if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
    return { date: null, outcome: EXPIRATION_OUTCOMES.MISSING_EXPIRATION };
  }

  const date = parseExpirationToUtcDate(raw);

  return date
    ? { date, outcome: EXPIRATION_OUTCOMES.RESOLVED }
    : { date: null, outcome: EXPIRATION_OUTCOMES.UNREADABLE_EXPIRATION };
};

const resolveAssociationExpiration = (member, siteAssociation) =>
  classifyAssociationExpiration(member, siteAssociation).date;

const summarizeExpirationOutcomes = (members = [], siteAssociation) => {
  const counts = Object.values(EXPIRATION_OUTCOMES).reduce(
    (acc, outcome) => ({ ...acc, [outcome]: 0 }),
    {}
  );

  (Array.isArray(members) ? members : []).forEach(member => {
    counts[classifyAssociationExpiration(member, siteAssociation).outcome] += 1;
  });

  return counts;
};

/** Keeps the backfill idempotent. Accepts a Date or the ISO string the CMS may return. */
const memberNeedsAssociationExpirationBackfill = (member, siteAssociation) => {
  const resolved = resolveAssociationExpiration(member, siteAssociation);
  const stored = member?.[ASSOCIATION_EXPIRATION_FIELD];

  const storedTime =
    stored instanceof Date ? stored.getTime() : stored ? new Date(stored).getTime() : null;
  const resolvedTime = resolved ? resolved.getTime() : null;

  if (storedTime === null && resolvedTime === null) return false;
  if (storedTime === null || resolvedTime === null) return true;

  return storedTime !== resolvedTime;
};

// Today in Denver, where PAC operates. UTC rolls over first, so a UTC-derived today would hide
// everyone expiring that day up to seven hours early, every evening.
const getTodayInAssociationTimeZone = (now = new Date()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ASSOCIATION_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const valueOf = type => Number(parts.find(part => part.type === type)?.value);
    const [year, month, day] = [valueOf('year'), valueOf('month'), valueOf('day')];

    if (![year, month, day].every(Number.isFinite)) {
      throw new Error('incomplete date parts');
    }

    return new Date(Date.UTC(year, month - 1, day));
  } catch (error) {
    // Hiding people a few hours early beats throwing on every search.
    console.error(
      `[associationExpiry] cannot resolve ${ASSOCIATION_TIME_ZONE}, using the UTC date instead. Members may be hidden up to 7 hours early. ${error.message}`
    );
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
};

const isAssociationExpirationCurrent = (member, now) => {
  const stored = member?.[ASSOCIATION_EXPIRATION_FIELD];
  const expiration = stored instanceof Date ? stored : stored ? new Date(stored) : null;

  if (!expiration || Number.isNaN(expiration.getTime())) return false;

  return expiration.getTime() >= getTodayInAssociationTimeZone(now).getTime();
};

module.exports = {
  parseExpirationToUtcDate,
  classifyAssociationExpiration,
  resolveAssociationExpiration,
  summarizeExpirationOutcomes,
  memberNeedsAssociationExpirationBackfill,
  getTodayInAssociationTimeZone,
  isAssociationExpirationCurrent,
  ASSOCIATION_EXPIRATION_FIELD,
  ASSOCIATION_TIME_ZONE,
  EXPIRATION_OUTCOMES,
};
