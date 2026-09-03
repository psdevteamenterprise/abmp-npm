const { buildMembersSearchQuery } = require('../cms-data-methods');
const { MEMBER_UPDATED_FIELD } = require('../listing-priority');

/* eslint-disable require-await -- the double mirrors the real Wix query API, which is async */

// A stand-in for the Wix query builder. Every chained call returns a NEW object, so the test
// fails the same way production would if the two tier queries ever shared state.
const makeCollection = rows => {
  const build = (predicates = []) => ({
    predicates,
    _rows() {
      return rows.filter(row => predicates.every(p => p(row)));
    },
    eq(field, value) {
      return build([...predicates, row => row[field] === value]);
    },
    ne(field, value) {
      return build([...predicates, row => row[field] !== value]);
    },
    ge: () => build(predicates),
    contains: () => build(predicates),
    hasSome: () => build(predicates),
    ascending: () => build(predicates),
    fields: () => build(predicates),
    skip(n) {
      const next = build(predicates);
      next._skip = n;
      return next;
    },
    limit(n) {
      const next = build(predicates);
      next._skip = this._skip;
      next._limit = n;
      return next;
    },
    async count() {
      return this._rows().length;
    },
    async find() {
      const all = this._rows();
      const from = this._skip || 0;
      // Deliberately no totalPages: @wix/data does not populate it, which is the bug this double
      // has to be able to reproduce.
      return { items: all.slice(from, from + (this._limit ?? all.length)) };
    },
  });
  return build();
};

let mockCollection;
jest.mock('../elevated-modules', () => ({
  wixData: {
    query: () => mockCollection,
    get: async () => ({}),
  },
}));

const mockGetSiteConfigs = jest.fn();
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  getSiteConfigs: (...args) => mockGetSiteConfigs(...args),
}));

const DENVER = { latitude: 39.7392, longitude: -104.9903 };

const member = (id, { updated = false, lat = null, lng = null } = {}) => ({
  _id: `id-${id}`,
  memberId: id,
  fullName: `Member ${id}`,
  isVisible: true,
  [MEMBER_UPDATED_FIELD]: updated,
  addressDisplayOption: [{ key: 'address_0', isMain: true }],
  addresses:
    lat === null
      ? []
      : [{ key: 'address_0', latitude: lat, longitude: lng, addressStatus: 'full_address' }],
});

const search = (rows, overrides = {}) => {
  mockCollection = makeCollection(rows);
  return buildMembersSearchQuery({
    filter: { latitude: 0, longitude: 0, ...overrides.filter },
    isSearchingNearby: overrides.isSearchingNearby || false,
  }).run();
};

beforeEach(() => {
  mockGetSiteConfigs.mockReset();
  mockGetSiteConfigs.mockResolvedValue(25);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('typed search ordering', () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => member(i + 1, { updated: true })),
    ...Array.from({ length: 200 }, (_, i) => member(i + 100)),
  ];

  test('every updated listing comes before every un-updated one', async () => {
    const { items } = await search(rows);

    const flags = items.map(item => item[MEMBER_UPDATED_FIELD] === true);
    const lastUpdated = flags.lastIndexOf(true);
    const firstRest = flags.indexOf(false);
    expect(lastUpdated).toBeLessThan(firstRest);
  });

  test('the tier boundary survives the shuffle', async () => {
    // The shuffle is random, so a single pass proves little. Ordering must hold every time.
    for (let run = 0; run < 25; run++) {
      const { items } = await search(rows);
      const flags = items.map(item => item[MEMBER_UPDATED_FIELD] === true);
      expect(flags.lastIndexOf(true)).toBeLessThan(flags.indexOf(false));
    }
  });

  test('the result set is still capped at 120', async () => {
    const { items } = await search(rows);
    expect(items).toHaveLength(120);
  });

  test('all 10 updated listings appear, and the rest fill the remaining 110', async () => {
    const { items } = await search(rows);
    const updated = items.filter(item => item[MEMBER_UPDATED_FIELD] === true);
    expect(updated).toHaveLength(10);
    expect(items).toHaveLength(120);
  });

  test('more updated listings than fit still fills the page with tier one only', async () => {
    const manyUpdated = Array.from({ length: 300 }, (_, i) => member(i + 1, { updated: true }));
    const { items } = await search([...manyUpdated, ...rows.slice(10)]);

    expect(items).toHaveLength(120);
    expect(items.every(item => item[MEMBER_UPDATED_FIELD] === true)).toBe(true);
  });

  test('no updated listings degrades to the previous behaviour', async () => {
    const { items } = await search(rows.slice(10));
    expect(items).toHaveLength(120);
    expect(items.every(item => item[MEMBER_UPDATED_FIELD] !== true)).toBe(true);
  });

  test('a member whose flag was never written is treated as tier two', async () => {
    const neverWritten = { ...member(999), [MEMBER_UPDATED_FIELD]: undefined };
    const { items } = await search([member(1, { updated: true }), neverWritten]);

    expect(items.map(item => item.memberId)).toEqual([1, 999]);
  });

  test('the two tiers are drawn from independent windows, never overlapping', async () => {
    const { items } = await search(rows);
    const ids = items.map(item => item.memberId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('"near me" ordering', () => {
  // Denver, then ~7 miles out, then ~35 miles out.
  const near = { lat: 39.7392, lng: -104.9903 };
  const midway = { lat: 39.8392, lng: -104.9903 };
  const faraway = { lat: 40.2392, lng: -104.9903 };

  const nearbySearch = rows => search(rows, { isSearchingNearby: true, filter: { ...DENVER } });

  test('an updated listing inside the radius outranks a closer un-updated one', async () => {
    const { items } = await nearbySearch([
      member(1, { ...near }),
      member(2, { updated: true, ...midway }),
    ]);

    expect(items.map(item => item.memberId)).toEqual([2, 1]);
  });

  test('an updated listing outside the radius does not jump the queue', async () => {
    const { items } = await nearbySearch([
      member(1, { ...near }),
      member(2, { updated: true, ...faraway }),
    ]);

    expect(items.map(item => item.memberId)).toEqual([1, 2]);
  });

  test('outside the radius, ordering is still nearest-first', async () => {
    const { items } = await nearbySearch([
      member(3, { updated: true, ...faraway }),
      member(1, { ...near }),
      member(2, { ...midway }),
    ]);

    expect(items.map(item => item.memberId)).toEqual([1, 2, 3]);
  });

  test('the radius comes from site config, so PAC can widen it without a release', async () => {
    mockGetSiteConfigs.mockResolvedValue(50);

    const { items } = await nearbySearch([
      member(1, { ...near }),
      member(2, { updated: true, ...faraway }),
    ]);

    // 35 miles is now inside the radius, so the updated listing leads.
    expect(items.map(item => item.memberId)).toEqual([2, 1]);
  });

  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a number', 'twenty-five'],
    ['zero', 0],
    ['negative', -5],
  ])('a %s radius config falls back to 25 miles rather than breaking search', async (_l, value) => {
    mockGetSiteConfigs.mockResolvedValue(value);

    const { items } = await nearbySearch([
      member(1, { ...near }),
      member(2, { updated: true, ...midway }),
      member(3, { updated: true, ...faraway }),
    ]);

    // midway (~7mi) is prioritised, faraway (~35mi) is not.
    expect(items.map(item => item.memberId)).toEqual([2, 1, 3]);
  });

  test('a failing config read falls back rather than breaking search', async () => {
    mockGetSiteConfigs.mockRejectedValue(new Error('SiteConfigs unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { items } = await nearbySearch([
      member(1, { ...near }),
      member(2, { updated: true, ...midway }),
    ]);

    expect(items.map(item => item.memberId)).toEqual([2, 1]);
  });

  // fetchAllItemsInParallel used to read totalPages off the first page. @wix/data never sets
  // it, so near-me silently searched only the first 1,000 candidates. With 4,500 in Denver's
  // geohash cells, an updated listing on page three never reached the partition.
  test('near me loads every page, not just the first 1,000 candidates', async () => {
    const crowd = Array.from({ length: 2400 }, (_, i) => member(i + 1000, { ...midway }));
    const onLastPage = member(1, { updated: true, ...near });
    const { items } = await nearbySearch([...crowd, onLastPage]);

    expect(items[0].memberId).toBe(1);
  });

  test('members with no usable coordinates are still dropped', async () => {
    const { items } = await nearbySearch([member(1, { ...near }), member(2, { updated: true })]);

    expect(items.map(item => item.memberId)).toEqual([1]);
  });
});
