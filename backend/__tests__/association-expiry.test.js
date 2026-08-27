const {
  parseExpirationToUtcDate,
  resolveAssociationExpiration,
  classifyAssociationExpiration,
  memberNeedsAssociationExpirationBackfill,
  summarizeExpirationOutcomes,
  getTodayInAssociationTimeZone,
  EXPIRATION_OUTCOMES,
} = require('../association-expiry');

// ─── Helpers ─────────────────────────────────────────────────────────

const membership = (association, expiration) => ({
  association,
  membertype: 'Certified',
  membersince: '2019-04-01T00:00:00',
  expiration,
});

const iso = date => (date === null ? null : date.toISOString());

// ─── Monday 12423706293 ──────────────────────────────────────────────
// Membership is per association but the feed sends one action for the whole person, so a member
// active anywhere stayed visible everywhere. The site's own expiration date is lifted out of the
// memberships array into a scalar the directory query can filter on.
// See PLAN-per-association-expiry.md.

describe('resolveAssociationExpiration - picks this site association', () => {
  it('returns the date for the site association, not another one on the record', () => {
    const member = {
      memberships: [
        membership('ASCP', '2027-07-18T00:00:00'),
        membership('ABMP', '2026-07-18T00:00:00'),
      ],
    };

    expect(iso(resolveAssociationExpiration(member, 'ABMP'))).toBe('2026-07-18T00:00:00.000Z');
    expect(iso(resolveAssociationExpiration(member, 'ASCP'))).toBe('2027-07-18T00:00:00.000Z');
  });

  it('returns the lapsed date for a multi-association member whose site association expired', () => {
    // Member 916468: ABMP expired 2026-07-18, ASCP active to 2027-07-18, still listed on ABMP.
    // The ABMP site must see the ABMP date, which is the whole point of the copied field - a
    // naive array filter would match the still-current ASCP entry and leave them visible.
    const member = {
      memberships: [
        membership('ABMP', '2026-07-18T00:00:00'),
        membership('ASCP', '2027-07-18T00:00:00'),
      ],
    };

    expect(iso(resolveAssociationExpiration(member, 'ABMP'))).toBe('2026-07-18T00:00:00.000Z');
  });

  it('returns null when the member has no membership for this association', () => {
    const member = { memberships: [membership('ASCP', '2027-07-18T00:00:00')] };

    expect(resolveAssociationExpiration(member, 'AHP')).toBeNull();
  });
});

describe('resolveAssociationExpiration - unusable input is null, which means hidden', () => {
  it.each([
    ['no memberships key', {}],
    ['memberships is not an array', { memberships: 'ABMP' }],
    ['empty memberships', { memberships: [] }],
    ['null member', null],
    ['undefined member', undefined],
  ])('returns null for %s', (_label, member) => {
    expect(resolveAssociationExpiration(member, 'ABMP')).toBeNull();
  });

  it('returns null when the site association is missing', () => {
    const member = { memberships: [membership('ABMP', '2027-07-18T00:00:00')] };

    expect(resolveAssociationExpiration(member, undefined)).toBeNull();
    expect(resolveAssociationExpiration(member, '')).toBeNull();
  });

  it('returns null when the matching membership has no expiration', () => {
    const member = { memberships: [membership('ABMP', undefined)] };

    expect(resolveAssociationExpiration(member, 'ABMP')).toBeNull();
  });
});

// ─── Timezone ────────────────────────────────────────────────────────
// The feed's expiration strings carry no zone. `new Date(str)` would read them as local time, so
// the same feed would produce different instants depending on where the code runs. Pinning to UTC
// midnight keeps the comparison a plain calendar comparison.

describe('parseExpirationToUtcDate - pins to UTC midnight', () => {
  it('parses a PAC expiration string to UTC midnight', () => {
    expect(iso(parseExpirationToUtcDate('2027-06-12T00:00:00'))).toBe('2027-06-12T00:00:00.000Z');
  });

  it('keeps the calendar day the feed sent, with no zone shift', () => {
    const parsed = parseExpirationToUtcDate('2027-06-12T00:00:00');

    expect(parsed.getUTCFullYear()).toBe(2027);
    expect(parsed.getUTCMonth()).toBe(5);
    expect(parsed.getUTCDate()).toBe(12);
    expect(parsed.getUTCHours()).toBe(0);
  });

  it('ignores any time component the feed happens to send', () => {
    expect(iso(parseExpirationToUtcDate('2027-06-12T23:59:59'))).toBe('2027-06-12T00:00:00.000Z');
  });

  it('accepts a bare date with no time at all', () => {
    expect(iso(parseExpirationToUtcDate('2027-06-12'))).toBe('2027-06-12T00:00:00.000Z');
  });

  it('tolerates surrounding whitespace', () => {
    expect(iso(parseExpirationToUtcDate('  2027-06-12T00:00:00  '))).toBe(
      '2027-06-12T00:00:00.000Z'
    );
  });
});

describe('parseExpirationToUtcDate - rejects rather than guesses', () => {
  it('rejects an impossible calendar date instead of rolling it forward', () => {
    // Date.UTC(2026, 1, 31) silently becomes 3 March. Storing that would be a real, wrong date.
    expect(parseExpirationToUtcDate('2026-02-31T00:00:00')).toBeNull();
  });

  it.each([
    '2026-13-01T00:00:00',
    '2026-00-10T00:00:00',
    '2026-06-32T00:00:00',
    '06/12/2027',
    'not a date',
    '',
    '   ',
  ])('rejects %s', value => {
    expect(parseExpirationToUtcDate(value)).toBeNull();
  });

  it.each([[null], [undefined], [0], [{}], [new Date()]])(
    'rejects the non-string value %p',
    value => {
      expect(parseExpirationToUtcDate(value)).toBeNull();
    }
  );
});

// ─── Reporting ───────────────────────────────────────────────────────
// PAC chose to hide members whose expiration is missing or unreadable (Drew Zarn, 2026-08-26),
// against our recommendation to show them. We undertook to report how many existing records that
// affects before the query gates on it, so the backfill classifies rather than just resolving.
// "No membership entry for this association" and "the date is malformed" are very different
// things, and only the second is a data bug worth escalating.

describe('classifyAssociationExpiration - says why, not just what', () => {
  it.each([
    [
      EXPIRATION_OUTCOMES.RESOLVED,
      { memberships: [membership('ABMP', '2027-07-18T00:00:00')] },
      'ABMP',
    ],
    [
      EXPIRATION_OUTCOMES.NO_MEMBERSHIP_FOR_ASSOCIATION,
      { memberships: [membership('ASCP', '2027-07-18T00:00:00')] },
      'ABMP',
    ],
    [EXPIRATION_OUTCOMES.MISSING_EXPIRATION, { memberships: [membership('ABMP', '')] }, 'ABMP'],
    [
      EXPIRATION_OUTCOMES.MISSING_EXPIRATION,
      { memberships: [membership('ABMP', undefined)] },
      'ABMP',
    ],
    [
      EXPIRATION_OUTCOMES.UNREADABLE_EXPIRATION,
      { memberships: [membership('ABMP', 'sometime in June')] },
      'ABMP',
    ],
    [
      EXPIRATION_OUTCOMES.UNREADABLE_EXPIRATION,
      { memberships: [membership('ABMP', '2026-02-31T00:00:00')] },
      'ABMP',
    ],
    [
      EXPIRATION_OUTCOMES.NO_SITE_ASSOCIATION,
      { memberships: [membership('ABMP', '2027-07-18T00:00:00')] },
      undefined,
    ],
  ])('reports %s', (expected, member, siteAssociation) => {
    expect(classifyAssociationExpiration(member, siteAssociation).outcome).toBe(expected);
  });

  it('separates a malformed date from a simply absent one', () => {
    // Both hide the member, but only the first means PAC sent us something broken.
    const malformed = classifyAssociationExpiration(
      { memberships: [membership('ABMP', '2026-02-31T00:00:00')] },
      'ABMP'
    );
    const absent = classifyAssociationExpiration({ memberships: [membership('ABMP', '')] }, 'ABMP');

    expect(malformed.date).toBeNull();
    expect(absent.date).toBeNull();
    expect(malformed.outcome).not.toBe(absent.outcome);
  });
});

describe('summarizeExpirationOutcomes', () => {
  it('counts every outcome, including the ones that are zero', () => {
    const members = [
      { memberships: [membership('ABMP', '2027-07-18T00:00:00')] },
      { memberships: [membership('ABMP', '2026-01-01T00:00:00')] },
      { memberships: [membership('ASCP', '2027-07-18T00:00:00')] },
      { memberships: [membership('ABMP', '')] },
      { memberships: [membership('ABMP', 'not a date')] },
    ];

    expect(summarizeExpirationOutcomes(members, 'ABMP')).toEqual({
      [EXPIRATION_OUTCOMES.RESOLVED]: 2,
      [EXPIRATION_OUTCOMES.NO_MEMBERSHIP_FOR_ASSOCIATION]: 1,
      [EXPIRATION_OUTCOMES.MISSING_EXPIRATION]: 1,
      [EXPIRATION_OUTCOMES.UNREADABLE_EXPIRATION]: 1,
      [EXPIRATION_OUTCOMES.NO_SITE_ASSOCIATION]: 0,
    });
  });

  it('counts an expired member as resolved - expired is a date, not a failure', () => {
    const members = [{ memberships: [membership('ABMP', '2020-01-01T00:00:00')] }];

    expect(summarizeExpirationOutcomes(members, 'ABMP')[EXPIRATION_OUTCOMES.RESOLVED]).toBe(1);
  });

  it('returns an all-zero tally for no members', () => {
    const counts = summarizeExpirationOutcomes([], 'ABMP');

    expect(Object.values(counts).every(value => value === 0)).toBe(true);
    expect(Object.keys(counts)).toHaveLength(Object.keys(EXPIRATION_OUTCOMES).length);
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────
// The backfill touches ~83k records per site. It has to be safely re-runnable after a partial
// failure without rewriting everything that is already correct.

describe('memberNeedsAssociationExpirationBackfill', () => {
  const withStored = (stored, expiration = '2027-07-18T00:00:00') => ({
    memberships: [membership('ABMP', expiration)],
    associationExpiration: stored,
  });

  it('is true when the field has never been written', () => {
    expect(memberNeedsAssociationExpirationBackfill(withStored(undefined), 'ABMP')).toBe(true);
  });

  it('is false when the stored Date already matches', () => {
    const stored = new Date(Date.UTC(2027, 6, 18));

    expect(memberNeedsAssociationExpirationBackfill(withStored(stored), 'ABMP')).toBe(false);
  });

  it('is false when the CMS hands the value back as an ISO string', () => {
    expect(
      memberNeedsAssociationExpirationBackfill(withStored('2027-07-18T00:00:00.000Z'), 'ABMP')
    ).toBe(false);
  });

  it('is true when the stored date is stale, e.g. after a renewal', () => {
    const stored = new Date(Date.UTC(2026, 6, 18));

    expect(memberNeedsAssociationExpirationBackfill(withStored(stored), 'ABMP')).toBe(true);
  });

  it('is true when a date is stored but the membership no longer resolves', () => {
    const member = {
      memberships: [membership('ASCP', '2027-07-18T00:00:00')],
      associationExpiration: new Date(Date.UTC(2027, 6, 18)),
    };

    expect(memberNeedsAssociationExpirationBackfill(member, 'ABMP')).toBe(true);
  });

  it('is false when there is nothing to store and nothing stored', () => {
    const member = { memberships: [membership('ASCP', '2027-07-18T00:00:00')] };

    expect(memberNeedsAssociationExpirationBackfill(member, 'ABMP')).toBe(false);
  });

  it('is true when the stored value is itself unreadable', () => {
    expect(memberNeedsAssociationExpirationBackfill(withStored('garbage'), 'ABMP')).toBe(true);
  });
});

// ─── "Today" is Denver's today ───────────────────────────────────────
// PAC operates from Denver. Denver is UTC-6/-7, so UTC rolls over first: at 19:00 on the 11th in
// Denver it is already the 12th in UTC. A member whose membership runs to the 11th is still valid,
// the grace period being baked into the date, but a UTC-derived "today" would compare them against
// the 12th and hide them hours early - every evening, for everyone expiring that day.

describe('getTodayInAssociationTimeZone', () => {
  it('is still the 11th at 19:00 Denver, when UTC has already reached the 12th', () => {
    const evening = new Date('2026-08-12T01:00:00Z'); // 2026-08-11 19:00 in Denver

    expect(getTodayInAssociationTimeZone(evening).toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('keeps a member expiring that day visible through the Denver evening', () => {
    const evening = new Date('2026-08-12T01:00:00Z');
    const expiresToday = parseExpirationToUtcDate('2026-08-11T00:00:00');

    // The gate is `expiration >= today`, so equal means visible.
    expect(expiresToday.getTime()).toBe(getTodayInAssociationTimeZone(evening).getTime());
  });

  it('rolls over once Denver reaches the next day', () => {
    const nextMorning = new Date('2026-08-12T14:00:00Z'); // 08:00 in Denver

    expect(getTodayInAssociationTimeZone(nextMorning).toISOString()).toBe(
      '2026-08-12T00:00:00.000Z'
    );
  });

  it('handles a mid-day instant with no ambiguity', () => {
    const midday = new Date('2026-01-15T19:00:00Z'); // 12:00 in Denver, MST

    expect(getTodayInAssociationTimeZone(midday).toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('returns UTC midnight, so it compares cleanly against stored expirations', () => {
    const today = getTodayInAssociationTimeZone(new Date('2026-08-12T14:00:00Z'));

    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
    expect(today.getUTCMilliseconds()).toBe(0);
  });

  it('accounts for daylight saving, which shifts the rollover by an hour', () => {
    // MDT is UTC-6: 06:00Z on 1 July is still 00:00 on the 1st in Denver.
    expect(getTodayInAssociationTimeZone(new Date('2026-07-01T06:00:00Z')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z'
    );
    // MST is UTC-7: 06:00Z on 1 January is still 23:00 on 31 December in Denver.
    expect(getTodayInAssociationTimeZone(new Date('2026-01-01T06:00:00Z')).toISOString()).toBe(
      '2025-12-31T00:00:00.000Z'
    );
  });
});
