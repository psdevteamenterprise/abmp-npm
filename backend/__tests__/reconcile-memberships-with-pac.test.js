const {
  planPatches,
  licensesForSite,
  toPatch,
} = require('../../dev-only-scripts/reconcile-memberships-with-pac');

const ASSOC = 'ASCP';
const row = (memberId, overrides = {}) => ({
  _id: `id-${memberId}`,
  memberId,
  fullName: `Member ${memberId}`,
  isVisible: true,
  optOut: false,
  action: 'none',
  wixMemberId: null,
  memberships: [
    { association: ASSOC, membertype: 'Professional', expiration: '2026-03-21T00:00:00' },
  ],
  licenses: [],
  associationExpiration: { $date: '2026-03-21T00:00:00Z' },
  ...overrides,
});
const feedMember = (memberid, expiration, overrides = {}) => ({
  memberid,
  memberships: [{ association: ASSOC, membertype: 'Professional', expiration }],
  licenses: [],
  ...overrides,
});
const feedOf = (...members) => new Map(members.map(m => [String(m.memberid), m]));
const plan = (rows, feed, args = {}) =>
  planPatches({ rows, feed, association: ASSOC, args: { includeStaff: false, ...args } });

describe('planPatches', () => {
  test('a renewal PAC sent that we never stored becomes a patch of the three sync fields only', () => {
    const { candidates } = plan([row(948664)], feedOf(feedMember(948664, '2027-03-21T00:00:00')));

    expect(candidates).toHaveLength(1);
    const [c] = candidates;
    expect(c.changed).toEqual({ memberships: true, licenses: false, associationExpiration: true });
    expect(c.after.associationExpiration).toBe('2027-03-21T00:00:00.000Z');
    expect(c.hiddenToday).toBe(true);
    const fields = toPatch(c).fieldModifications.map(f => f.fieldPath);
    expect(fields).toEqual(['memberships', 'licenses', 'associationExpiration']);
  });

  test('the same membership serialised in a different key order is not a change', () => {
    const stored = row(9, {
      memberships: [
        {
          expiration: '2026-03-21T00:00:00',
          membersince: '2011-03-12T00:00:00',
          association: ASSOC,
          membertype: 'Professional',
        },
      ],
    });
    const feed = feedOf({
      memberid: 9,
      memberships: [
        {
          association: ASSOC,
          membertype: 'Professional',
          expiration: '2026-03-21T00:00:00',
          membersince: '2011-03-12T00:00:00',
        },
      ],
      licenses: [],
    });
    const { candidates, skipped } = plan([stored], feed);
    expect(candidates).toHaveLength(0);
    expect(skipped.unchanged).toBe(1);
  });

  test('a row that already matches the feed is left alone', () => {
    const { candidates, skipped } = plan([row(1)], feedOf(feedMember(1, '2026-03-21T00:00:00')));
    expect(candidates).toHaveLength(0);
    expect(skipped.unchanged).toBe(1);
  });

  test('hidden, opted-out and dropped rows are never touched', () => {
    const feed = feedOf(
      feedMember(1, '2028-01-01T00:00:00'),
      feedMember(2, '2028-01-01T00:00:00'),
      feedMember(3, '2028-01-01T00:00:00')
    );
    const { candidates, skipped } = plan(
      [row(1, { isVisible: false }), row(2, { optOut: true }), row(3, { action: 'drop' })],
      feed
    );
    expect(candidates).toHaveLength(0);
    expect(skipped).toMatchObject({ notVisible: 1, optOut: 1, dropped: 1 });
  });

  test('a member absent from the feed is skipped rather than blanked', () => {
    const { candidates, skipped } = plan([row(1)], feedOf());
    expect(candidates).toHaveLength(0);
    expect(skipped.notInFeed).toBe(1);
  });

  test('PAC STAFF are reported but not written unless asked', () => {
    const staffRow = row(7, {
      memberships: [
        { association: ASSOC, membertype: 'PAC STAFF', expiration: '2026-06-02T04:21:01' },
      ],
      associationExpiration: { $date: '2026-06-02T00:00:00Z' },
    });
    const feed = feedOf(
      feedMember(7, '2026-09-15T18:01:39', {
        memberships: [
          { association: ASSOC, membertype: 'PAC STAFF', expiration: '2026-09-15T18:01:39' },
        ],
      })
    );

    const { candidates } = plan([staffRow], feed);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].staff).toBe(true);
    // The caller filters on `staff` unless --include-staff; the plan records it either way.
  });

  test('a membership type change with the same expiration is still a patch', () => {
    const feed = feedOf(
      feedMember(5, '2026-03-21T00:00:00', {
        memberships: [
          { association: ASSOC, membertype: 'Certified', expiration: '2026-03-21T00:00:00' },
        ],
      })
    );
    const { candidates } = plan([row(5)], feed);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].changed).toEqual({
      memberships: true,
      licenses: false,
      associationExpiration: false,
    });
  });

  test('a licenses-only difference does not select a row', () => {
    const feed = feedOf(
      feedMember(4, '2026-03-21T00:00:00', {
        licenses: [{ association: ASSOC, license: 'x', state: 'TX' }],
      })
    );
    const { candidates, skipped } = plan(
      [row(4, { licenses: [{ license: 'x', state: 'TX' }] })],
      feed
    );
    expect(candidates).toHaveLength(0);
    expect(skipped.unchanged).toBe(1);
  });

  test('licenses are written filtered to the site association, as the sync does', () => {
    expect(
      licensesForSite(
        [
          { association: 'ABMP', license: 'x' },
          { association: ASSOC, license: 'y' },
          { license: 'z' },
        ],
        ASSOC
      )
    ).toEqual([{ association: ASSOC, license: 'y' }, { license: 'z' }]);
  });

  test('--member-id restricts the plan to that member', () => {
    const feed = feedOf(feedMember(1, '2028-01-01T00:00:00'), feedMember(2, '2028-01-01T00:00:00'));
    const { candidates } = plan([row(1), row(2)], feed, { memberId: '2' });
    expect(candidates.map(c => c.memberId)).toEqual([2]);
  });
});
