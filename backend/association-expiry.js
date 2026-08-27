/**
 * The per-association expiry rule, in one place.
 *
 * Used by three callers that must agree: the daily sync writes the date, the backfill fills it in
 * for members the sync will not touch, and the directory query compares it against today. If they
 * ever disagreed, members would be hidden or shown for reasons nobody could reproduce.
 *
 * Deliberately free of Wix imports so it stays directly testable, and so the read path never has
 * to reach into daily-pull/ to ask what the rule is.
 *
 * See PLAN-per-association-expiry.md.
 */

/**
 * Matches the calendar part of an expiration value. PAC sends expiration dates inside the
 * memberships array as plain ISO strings with no zone and no milliseconds, e.g.
 * "2027-06-12T00:00:00" - unlike top-level CMS dates, which are real date values.
 */
const EXPIRATION_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Parses a PAC expiration string into a Date pinned to UTC midnight.
 *
 * Deliberately does NOT use `new Date(expiration)`. The string carries no zone, so the runtime
 * would read it as local time; the same feed would then produce different instants depending on
 * where the code runs. Building from the calendar parts keeps a membership expiring on the 12th
 * stored as the 12th everywhere, which is what makes the query a plain calendar comparison.
 *
 * @param {string} expiration - e.g. "2027-06-12T00:00:00"
 * @returns {Date|null} UTC-midnight date, or null when absent or unreadable
 */
const parseExpirationToUtcDate = expiration => {
  if (typeof expiration !== 'string') return null;

  const match = EXPIRATION_DATE_PATTERN.exec(expiration.trim());
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC silently rolls impossible dates forward - 2026-02-31 becomes 3 March. Round-trip the
  // parts so a malformed date is rejected rather than stored as a real, wrong one.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
};

/**
 * Resolves the expiration date of the membership for this site's OWN association.
 *
 * Each association is a separate site with its own collection, so the ABMP site stores the ABMP
 * date and nothing else. The copy exists because Wix Data cannot correlate two conditions within
 * the same array element: filtering memberships.association = "ABMP" together with
 * memberships.expiration < today can be satisfied by two different entries, which matches members
 * whose ABMP is current and whose ASCP has lapsed. See PLAN-per-association-expiry.md.
 *
 * Returns null when the association has no membership entry, or its expiration is missing or
 * unreadable. Null means hidden - PAC's call (Drew Zarn, 2026-08-26): an unreadable expiration is
 * an invalid membership.
 *
 * @param {Object} member - raw member from the PAC feed
 * @param {string} siteAssociation - this site's association, from SITE_ASSOCIATION site config
 * @returns {Date|null}
 */
/**
 * Why a resolution came out the way it did. The backfill reports these so PAC can see the cost of
 * hiding members with no readable expiration - a member with no entry for this association is a
 * very different thing from one whose date is malformed, and only the second is a data bug.
 */
const EXPIRATION_OUTCOMES = {
  RESOLVED: 'resolved',
  NO_SITE_ASSOCIATION: 'noSiteAssociation',
  NO_MEMBERSHIP_FOR_ASSOCIATION: 'noMembershipForAssociation',
  MISSING_EXPIRATION: 'missingExpiration',
  UNREADABLE_EXPIRATION: 'unreadableExpiration',
};

/**
 * Resolves this site's association expiration and says why, for reporting.
 * resolveAssociationExpiration is the thin wrapper over this - one source of truth for the rule.
 *
 * @param {Object} member
 * @param {string} siteAssociation
 * @returns {{ date: Date|null, outcome: string }}
 */
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
  if (!date) {
    return { date: null, outcome: EXPIRATION_OUTCOMES.UNREADABLE_EXPIRATION };
  }

  return { date, outcome: EXPIRATION_OUTCOMES.RESOLVED };
};

const resolveAssociationExpiration = (member, siteAssociation) =>
  classifyAssociationExpiration(member, siteAssociation).date;

/**
 * Tallies why a set of members resolved the way they did.
 *
 * Every outcome key is present even at zero, so a report reads as a real zero rather than a
 * missing measurement - which matters when the number is going back to PAC as the cost of hiding
 * members with no readable expiration.
 *
 * @param {Array} members
 * @param {string} siteAssociation
 * @returns {Object} outcome name -> count
 */
const summarizeExpirationOutcomes = (members = [], siteAssociation) => {
  const counts = Object.values(EXPIRATION_OUTCOMES).reduce(
    (acc, outcome) => ({ ...acc, [outcome]: 0 }),
    {}
  );

  (Array.isArray(members) ? members : []).forEach(member => {
    const { outcome } = classifyAssociationExpiration(member, siteAssociation);
    counts[outcome] += 1;
  });

  return counts;
};

/**
 * Whether a stored record still disagrees with what the rule resolves to.
 *
 * Keeps the backfill idempotent, so it can be re-run after a partial failure without rewriting
 * 83k records that are already correct. Both a Date and the ISO string the CMS may hand back are
 * accepted for the stored side; an unparseable stored value compares as different and is rewritten.
 *
 * @param {Object} member - the stored CMS record
 * @param {string} siteAssociation
 * @returns {boolean}
 */
const memberNeedsAssociationExpirationBackfill = (member, siteAssociation) => {
  const resolved = resolveAssociationExpiration(member, siteAssociation);
  const stored = member?.associationExpiration;

  const storedTime =
    stored instanceof Date ? stored.getTime() : stored ? new Date(stored).getTime() : null;
  const resolvedTime = resolved ? resolved.getTime() : null;

  if (storedTime === null && resolvedTime === null) return false;
  if (storedTime === null || resolvedTime === null) return true;

  return storedTime !== resolvedTime;
};

/**
 * PAC operates from Denver, so "today" is Denver's calendar day, not UTC's.
 *
 * This matters at the boundary. Denver is UTC-6/-7, so UTC rolls over first: at 18:00 on the 11th
 * in Denver it is already the 12th in UTC. A member whose membership runs to the 11th is still
 * valid - the grace period is already baked into the date (Drew Zarn, 2026-08-26) - but a
 * UTC-derived "today" would compare them against the 12th and hide them roughly seven hours early,
 * every single evening.
 */
/**
 * The stored scalar this rule reads and writes. Named rather than inlined at the query site: a
 * typo in a filter field name does not error on this collection, it silently matches nothing,
 * which would read as "no members are expired" instead of "the query is broken".
 */
const ASSOCIATION_EXPIRATION_FIELD = 'associationExpiration';

const ASSOCIATION_TIME_ZONE = 'America/Denver';

/**
 * Today's date in PAC's timezone, pinned to UTC midnight so it compares cleanly against the stored
 * expiration dates, which are pinned the same way.
 *
 * Falls back to the UTC calendar date if the runtime has no timezone data, which would reintroduce
 * the early-hiding window described above - so it logs loudly rather than failing silently. A
 * directory that hides people a few hours early is bad; one that throws on every search is worse.
 *
 * @param {Date} [now] - injectable for tests
 * @returns {Date} UTC midnight of today's date in PAC's timezone
 */
const getTodayInAssociationTimeZone = (now = new Date()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ASSOCIATION_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const valueOf = type => Number(parts.find(part => part.type === type)?.value);
    const year = valueOf('year');
    const month = valueOf('month');
    const day = valueOf('day');

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      throw new Error('incomplete date parts');
    }

    return new Date(Date.UTC(year, month - 1, day));
  } catch (error) {
    console.error(
      `[associationExpiry] cannot resolve ${ASSOCIATION_TIME_ZONE}, falling back to the UTC date. Members may be hidden up to 7 hours early. ${error.message}`
    );
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
};

module.exports = {
  parseExpirationToUtcDate,
  classifyAssociationExpiration,
  resolveAssociationExpiration,
  summarizeExpirationOutcomes,
  memberNeedsAssociationExpirationBackfill,
  getTodayInAssociationTimeZone,
  ASSOCIATION_EXPIRATION_FIELD,
  ASSOCIATION_TIME_ZONE,
  EXPIRATION_OUTCOMES,
};
