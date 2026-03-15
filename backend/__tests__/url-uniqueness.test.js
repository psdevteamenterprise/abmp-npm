const { incrementUrlCounter, extractBaseUrl } = require('../daily-pull/utils');
const {
  normalizeUrlForComparison,
  sortByUrlCounterDescending,
  extractUrlCounter,
} = require('../utils');

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Simulates getMemberBySlug's normalized-comparison branch using
 * the ACTUAL production sort comparator imported from utils.js.
 */
function simulateGetHighestMember(allMembers, slug) {
  const matching = allMembers.filter(
    m => m.url && normalizeUrlForComparison(m.url) === slug.toLowerCase()
  );
  matching.sort(sortByUrlCounterDescending);
  return matching[0] || null;
}

/**
 * Simulates ensureUniqueUrl's counter-increment logic given the
 * "highest" member returned by getMemberBySlug.
 */
function simulateEnsureUniqueUrl(baseSlug, highestMember) {
  if (!highestMember || !highestMember.url) return baseSlug;
  const lastSegment = highestMember.url.split('-').pop() || '0';
  const lastCounter = parseInt(lastSegment, 10) || 0;
  return `${baseSlug}-${lastCounter + 1}`;
}

// ─── Test data ───────────────────────────────────────────────────────

function buildMembersInDb() {
  return [
    { memberId: 1, url: 'firstNameLastName' },
    { memberId: 2, url: 'firstNameLastName-1' },
    { memberId: 3, url: 'firstNameLastName-2' },
    { memberId: 4, url: 'firstNameLastName-3' },
    { memberId: 5, url: 'firstNameLastName-4' },
    { memberId: 6, url: 'firstNameLastName-5' },
    { memberId: 7, url: 'firstNameLastName-6' },
    { memberId: 8, url: 'firstNameLastName-7' },
    { memberId: 9, url: 'firstNameLastName-8' },
    { memberId: 10, url: 'firstNameLastName-9' },
    { memberId: 11, url: 'firstNameLastName-10' },
    { memberId: 12, url: 'firstNameLastName-11' },
    { memberId: 13, url: 'firstNameLastName-12' },
  ];
}

function buildLargeCounterMembers() {
  const members = [];
  for (let i = 0; i <= 105; i++) {
    members.push({ memberId: i, url: i === 0 ? 'testUser' : `testUser-${i}` });
  }
  return members;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Production sort: getMemberBySlug must return the HIGHEST counter', () => {
  test('should return -12 as the highest URL (not -9)', () => {
    const members = buildMembersInDb();
    const highest = simulateGetHighestMember(members, 'firstnamelastname');

    expect(highest.url).toBe('firstNameLastName-12');
  });

  test('should sort -12 above -9 in descending order', () => {
    const members = buildMembersInDb();
    const sorted = [...members]
      .filter(m => normalizeUrlForComparison(m.url) === 'firstnamelastname')
      .sort(sortByUrlCounterDescending);
    const sortedUrls = sorted.map(m => m.url);

    const indexOf9 = sortedUrls.indexOf('firstNameLastName-9');
    const indexOf12 = sortedUrls.indexOf('firstNameLastName-12');

    expect(indexOf12).toBeLessThan(indexOf9);
  });

  test('should handle large counters (100+) correctly', () => {
    const members = buildLargeCounterMembers();
    const highest = simulateGetHighestMember(members, 'testuser');

    expect(highest.url).toBe('testUser-105');
  });

  test('should handle hyphenated names (mary-jane) correctly', () => {
    const members = [
      { memberId: 1, url: 'mary-jane' },
      { memberId: 2, url: 'mary-jane-1' },
      { memberId: 3, url: 'mary-jane-2' },
      { memberId: 4, url: 'mary-jane-10' },
    ];

    const highest = simulateGetHighestMember(members, 'mary-jane');
    expect(highest.url).toBe('mary-jane-10');
  });
});

describe('Production sort: ensureUniqueUrl must generate a truly unique URL', () => {
  test('should generate -13 (not -10) when DB has URLs up to -12', () => {
    const members = buildMembersInDb();
    const highest = simulateGetHighestMember(members, 'firstnamelastname');
    const newUrl = simulateEnsureUniqueUrl('firstNameLastName', highest);

    expect(newUrl).toBe('firstNameLastName-13');

    const existingUrls = members.map(m => m.url);
    expect(existingUrls).not.toContain(newUrl);
  });

  test('repeated daily pulls should produce sequential unique URLs', () => {
    const members = buildMembersInDb();
    const generatedUrls = [];

    for (let day = 0; day < 5; day++) {
      const highest = simulateGetHighestMember(members, 'firstnamelastname');
      const newUrl = simulateEnsureUniqueUrl('firstNameLastName', highest);
      generatedUrls.push(newUrl);
      members.push({ memberId: 100 + day, url: newUrl });
    }

    expect(new Set(generatedUrls).size).toBe(5);
    expect(generatedUrls).toEqual([
      'firstNameLastName-13',
      'firstNameLastName-14',
      'firstNameLastName-15',
      'firstNameLastName-16',
      'firstNameLastName-17',
    ]);
  });

  test('should NOT produce duplicates (the -10 bug)', () => {
    const members = buildMembersInDb();
    const highest = simulateGetHighestMember(members, 'firstnamelastname');
    const newUrl = simulateEnsureUniqueUrl('firstNameLastName', highest);

    expect(newUrl).not.toBe('firstNameLastName-10');
  });
});

describe('Production sort: ensureUniqueUrlsInBatch single-member path', () => {
  test('incrementUrlCounter should produce a unique URL from highest DB member', () => {
    const members = buildMembersInDb();
    const dbMember = simulateGetHighestMember(members, 'firstnamelastname');
    const result = incrementUrlCounter(dbMember.url, 'firstNameLastName');

    expect(result).toBe('firstNameLastName-13');

    const existingUrls = members.map(m => m.url);
    expect(existingUrls).not.toContain(result);
  });
});

describe('Utility functions', () => {
  test('normalizeUrlForComparison strips trailing counter', () => {
    expect(normalizeUrlForComparison('firstNameLastName')).toBe('firstnamelastname');
    expect(normalizeUrlForComparison('firstNameLastName-1')).toBe('firstnamelastname');
    expect(normalizeUrlForComparison('firstNameLastName-9')).toBe('firstnamelastname');
    expect(normalizeUrlForComparison('firstNameLastName-10')).toBe('firstnamelastname');
    expect(normalizeUrlForComparison('firstNameLastName-100')).toBe('firstnamelastname');
  });

  test('extractUrlCounter returns numeric counter', () => {
    expect(extractUrlCounter('firstNameLastName')).toBe(-1);
    expect(extractUrlCounter('firstNameLastName-1')).toBe(1);
    expect(extractUrlCounter('firstNameLastName-9')).toBe(9);
    expect(extractUrlCounter('firstNameLastName-10')).toBe(10);
    expect(extractUrlCounter('firstNameLastName-100')).toBe(100);
    expect(extractUrlCounter(null)).toBe(-1);
    expect(extractUrlCounter('')).toBe(-1);
  });

  test('extractBaseUrl strips numeric counter', () => {
    expect(extractBaseUrl('firstNameLastName-10')).toBe('firstNameLastName');
    expect(extractBaseUrl('firstNameLastName-1')).toBe('firstNameLastName');
    expect(extractBaseUrl('firstNameLastName')).toBe('firstNameLastName');
    expect(extractBaseUrl('john-doe-3')).toBe('john-doe');
  });

  test('incrementUrlCounter increments correctly', () => {
    expect(incrementUrlCounter('firstNameLastName-9', 'firstNameLastName')).toBe(
      'firstNameLastName-10'
    );
    expect(incrementUrlCounter('firstNameLastName-10', 'firstNameLastName')).toBe(
      'firstNameLastName-11'
    );
    expect(incrementUrlCounter('firstNameLastName', 'firstNameLastName')).toBe(
      'firstNameLastName-1'
    );
  });
});
