const {
  isLoginAllowedByExpiration,
  isPacStaff,
  isAssociationExpirationCurrent,
} = require('../association-expiry');

const NOW = new Date('2026-09-15T15:00:00Z');
const member = (expiration, membertype = 'Professional') => ({
  memberId: 1,
  associationExpiration: expiration,
  memberships: [{ association: 'ASCP', membertype, expiration }],
});

describe('isLoginAllowedByExpiration', () => {
  test('a regular member with a current expiration may log in', () => {
    expect(isLoginAllowedByExpiration(member(new Date('2027-03-21T00:00:00Z')), NOW)).toBe(true);
  });

  test('a regular member with a lapsed expiration is refused, as before', () => {
    expect(isLoginAllowedByExpiration(member(new Date('2026-03-21T00:00:00Z')), NOW)).toBe(false);
    expect(isAssociationExpirationCurrent(member(new Date('2026-03-21T00:00:00Z')), NOW)).toBe(
      false
    );
  });

  // Staff "expiration" is the date of the feed that last resent them, so it is stale on any quiet
  // day. Lara's froze on 2026-06-02 and locked her out from 28 August.
  test('PAC staff may log in even with a stale rolling expiration', () => {
    const lara = member(new Date('2026-06-02T00:00:00Z'), 'PAC STAFF');
    expect(isPacStaff(lara)).toBe(true);
    expect(isAssociationExpirationCurrent(lara, NOW)).toBe(false);
    expect(isLoginAllowedByExpiration(lara, NOW)).toBe(true);
  });

  test('staff status comes from any membership, not only the site association', () => {
    const staff = {
      associationExpiration: new Date('2026-01-01T00:00:00Z'),
      memberships: [
        { association: 'ABMP', membertype: 'PAC STAFF' },
        { association: 'ASCP', membertype: 'PAC STAFF' },
      ],
    };
    expect(isLoginAllowedByExpiration(staff, NOW)).toBe(true);
  });

  test('a member with no memberships at all is not staff and is gated normally', () => {
    expect(isPacStaff({ associationExpiration: null })).toBe(false);
    expect(isLoginAllowedByExpiration({ associationExpiration: null }, NOW)).toBe(false);
  });
});
