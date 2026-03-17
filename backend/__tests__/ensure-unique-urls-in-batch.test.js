const { ensureUniqueUrlsInBatch } = require('../daily-pull/bulk-process-methods');
const membersDataMethods = require('../members-data-methods');
jest.mock('../members-data-methods');

describe('ensureUniqueUrlsInBatch', () => {
  beforeEach(() => {
    membersDataMethods.getMemberBySlug.mockReset();
  });

  describe('case-insensitivity (regression: avoid creating John-12 AND john-12)', () => {
    test('merges John-11 and john-11 into one group and assigns unique sequential URLs', async () => {
      membersDataMethods.getMemberBySlug.mockResolvedValue({ url: 'John-11', memberId: 1 });

      const members = [
        { memberId: 101, url: 'John-11', fullName: 'John Doe' },
        { memberId: 102, url: 'john-11', fullName: 'John Doe' },
      ];

      const result = await ensureUniqueUrlsInBatch(members);

      const urls = result.map(m => m.url);

      expect(urls).toHaveLength(2);
      expect(new Set(urls).size).toBe(2);
      expect(urls.some(u => u.endsWith('-12'))).toBe(true);
      expect(urls.some(u => u.endsWith('-13'))).toBe(true);
    });

    test('does NOT create both John-12 and john-12 (case duplicate)', async () => {
      membersDataMethods.getMemberBySlug.mockResolvedValue({ url: 'John-11', memberId: 1 });

      const members = [
        { memberId: 101, url: 'John-11' },
        { memberId: 102, url: 'john-11' },
      ];

      const result = await ensureUniqueUrlsInBatch(members);
      const urls = result.map(m => m.url);

      const hasJohn12 = urls.some(u => u === 'John-12');
      const hasjohn12 = urls.some(u => u === 'john-12');
      expect(hasJohn12 && hasjohn12).toBe(false);
    });

    test('handles JOHN, John, john variants - all merge into single group', async () => {
      membersDataMethods.getMemberBySlug.mockResolvedValue(null);

      const members = [
        { memberId: 101, url: 'JOHN-5' },
        { memberId: 102, url: 'John-5' },
        { memberId: 103, url: 'john-5' },
      ];

      const result = await ensureUniqueUrlsInBatch(members);
      const urls = result.map(m => m.url);

      expect(urls).toHaveLength(3);
      expect(new Set(urls).size).toBe(3);
      const bases = urls.map(u => u.replace(/-\d+$/, '').toLowerCase());
      expect(new Set(bases).size).toBe(1);
    });
  });

  describe('multiple members with same base URL', () => {
    test('assigns sequential counters starting after batch max and DB max', async () => {
      membersDataMethods.getMemberBySlug.mockResolvedValue({
        url: 'firstNameLastName-11',
        memberId: 1,
      });

      const members = [
        { memberId: 201, url: 'firstNameLastName-11' },
        { memberId: 202, url: 'firstNameLastName-11' },
        { memberId: 203, url: 'firstNameLastName-11' },
      ];

      const result = await ensureUniqueUrlsInBatch(members);
      const urls = result.map(m => m.url).sort();

      expect(urls).toEqual([
        'firstNameLastName-12',
        'firstNameLastName-13',
        'firstNameLastName-14',
      ]);
    });

    test('uses batch max when DB has no matches', async () => {
      membersDataMethods.getMemberBySlug.mockResolvedValue(null);

      const members = [
        { memberId: 301, url: 'testUser-5' },
        { memberId: 302, url: 'testUser-5' },
      ];

      const result = await ensureUniqueUrlsInBatch(members);
      const urls = result.map(m => m.url).sort();

      expect(urls).toEqual(['testUser-6', 'testUser-7']);
    });
  });

  describe('edge cases', () => {
    test('returns empty array unchanged', async () => {
      const result = await ensureUniqueUrlsInBatch([]);
      expect(result).toEqual([]);
    });

    test('returns non-array unchanged', async () => {
      const input = { not: 'array' };
      const result = await ensureUniqueUrlsInBatch(input);
      expect(result).toBe(input);
    });

    test('skips members without url', async () => {
      membersDataMethods.getMemberBySlug.mockResolvedValue(null);

      const members = [
        { memberId: 401, url: 'validUrl' },
        { memberId: 402, url: null },
        { memberId: 403 },
      ];

      const result = await ensureUniqueUrlsInBatch(members);
      expect(result).toHaveLength(3);
      expect(result[0].url).toBe('validUrl');
      expect(result[1].url).toBeNull();
    });
  });
});
