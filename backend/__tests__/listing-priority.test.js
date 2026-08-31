const { generateUpdatedMemberData } = require('../daily-pull/process-member-methods');
const {
  MEMBER_UPDATED_FIELD,
  MEMBER_ENTERED_FIELDS,
  hasMemberEnteredContent,
  memberNeedsUpdatedFlagBackfill,
  summarizeUpdatedOutcomes,
} = require('../listing-priority');

jest.mock('../members-data-methods');
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  generateGeoHash: () => 'hash',
}));

describe('hasMemberEnteredContent', () => {
  test.each(MEMBER_ENTERED_FIELDS)('%s alone is enough', field => {
    const value = ['gallery', 'bannerImages', 'testimonial'].includes(field) ? ['a'] : 'a';
    expect(hasMemberEnteredContent({ [field]: value })).toBe(true);
  });

  test('a member with none of the five fields has entered nothing', () => {
    expect(hasMemberEnteredContent({ fullName: 'Jane Doe', website: 'jane.com' })).toBe(false);
  });

  test.each([
    ['empty arrays', { gallery: [], bannerImages: [], testimonial: [] }],
    ['empty strings', { profileImage: '', businessName: '' }],
    ['whitespace only', { businessName: '   ' }],
    ['nulls', { profileImage: null, gallery: null }],
    ['undefined', {}],
  ])('%s do not count', (_label, member) => {
    expect(hasMemberEnteredContent(member)).toBe(false);
  });

  test('migration-written content does not count', () => {
    // The nine fields the migration wrote. Presence here says nothing about member activity.
    const migrated = {
      website: 'jane.com',
      logoImage: 'https://example.com/logo.png',
      areasOfPractices: ['Swedish'],
      aboutService: 'About Jane',
      bookingUrl: 'https://book.example.com',
      addressInfo: 'Suite 2',
      showPhone: true,
      optOut: false,
      showABMP: true,
    };
    expect(hasMemberEnteredContent(migrated)).toBe(false);
  });
});

describe('memberNeedsUpdatedFlagBackfill', () => {
  test('content but no flag needs the backfill', () => {
    expect(memberNeedsUpdatedFlagBackfill({ businessName: 'Jane Massage' })).toBe(true);
  });

  test('content and the flag already set does not', () => {
    expect(
      memberNeedsUpdatedFlagBackfill({ businessName: 'Jane Massage', [MEMBER_UPDATED_FIELD]: true })
    ).toBe(false);
  });

  test('no content does not, flag or otherwise', () => {
    expect(memberNeedsUpdatedFlagBackfill({})).toBe(false);
    expect(memberNeedsUpdatedFlagBackfill({ [MEMBER_UPDATED_FIELD]: true })).toBe(false);
  });

  test('a member who saved and then emptied their listing keeps the flag', () => {
    // The flag records that they have been in, not what they left behind, so the backfill must
    // not read "no content" as grounds to clear it.
    const emptied = { [MEMBER_UPDATED_FIELD]: true, gallery: [], businessName: '' };
    expect(memberNeedsUpdatedFlagBackfill(emptied)).toBe(false);
  });
});

describe('summarizeUpdatedOutcomes', () => {
  test('splits the population into the two tiers', () => {
    const members = [
      { businessName: 'Jane Massage' }, // content, no flag -> backfill
      { profileImage: 'img.png', [MEMBER_UPDATED_FIELD]: true }, // already flagged
      { [MEMBER_UPDATED_FIELD]: true }, // saved, left nothing behind
      { fullName: 'Never Touched' }, // tier 2
      {},
    ];

    expect(summarizeUpdatedOutcomes(members)).toEqual({
      total: 5,
      tierOne: 3,
      tierTwo: 2,
      alreadyFlagged: 2,
      needingBackfill: 1,
    });
  });

  test('an empty population reports zeroes rather than throwing', () => {
    expect(summarizeUpdatedOutcomes([])).toEqual({
      total: 0,
      tierOne: 0,
      tierTwo: 0,
      alreadyFlagged: 0,
      needingBackfill: 0,
    });
  });
});

// The flag survives the nightly sync only because createCoreMemberData spreads the existing record
// before the fields it always rewrites. That is implicit, and adding the flag to the rewrite block
// would silently reset every member to tier 2 on the next pull, so it is pinned here.
describe('the daily sync must not clear the flag', () => {
  const inputMemberData = {
    memberid: 132545,
    email: 'jane@example.com',
    action: 'update',
    memberships: [{ association: 'ABMP', membertype: 'Professional' }],
    licenses: [],
  };

  test('an existing flagged member keeps the flag through a sync', async () => {
    const existingDbMember = {
      _id: 'abc',
      memberId: 132545,
      email: 'jane@example.com',
      [MEMBER_UPDATED_FIELD]: true,
    };

    const result = await generateUpdatedMemberData({
      inputMemberData,
      currentPageNumber: 1,
      existingDbMember,
    });

    expect(result[MEMBER_UPDATED_FIELD]).toBe(true);
  });

  test('the feed cannot set the flag on a member who never saved', async () => {
    const existingDbMember = { _id: 'abc', memberId: 132545, email: 'jane@example.com' };

    const result = await generateUpdatedMemberData({
      inputMemberData: { ...inputMemberData, [MEMBER_UPDATED_FIELD]: true },
      currentPageNumber: 1,
      existingDbMember,
    });

    expect(result[MEMBER_UPDATED_FIELD]).toBeUndefined();
  });

  test('a member dropped and reinstated keeps the flag', async () => {
    const existingDbMember = {
      _id: 'abc',
      memberId: 132545,
      email: 'jane@example.com',
      [MEMBER_UPDATED_FIELD]: true,
    };

    const result = await generateUpdatedMemberData({
      inputMemberData: { ...inputMemberData, action: 'drop' },
      currentPageNumber: 1,
      existingDbMember,
    });

    expect(result[MEMBER_UPDATED_FIELD]).toBe(true);
    expect(result.isVisible).toBe(false);
  });
});
