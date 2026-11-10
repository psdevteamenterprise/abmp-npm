jest.mock('../elevated-modules', () => ({
  wixData: { query: jest.fn(), search: jest.fn() },
}));

const { wixData } = require('../elevated-modules');
const { getMemberBySlug } = require('../members-data-methods');

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Builds a chainable query stub that records the calls made against it, so a
 * test can assert which operators getMemberBySlug applied.
 */
const mockQueryReturning = items => {
  const calls = { contains: [], ne: [], limit: [] };
  const query = {
    contains: jest.fn((field, value) => {
      calls.contains.push([field, value]);
      return query;
    }),
    ne: jest.fn((field, value) => {
      calls.ne.push([field, value]);
      return query;
    }),
    limit: jest.fn(n => {
      calls.limit.push(n);
      return query;
    }),
    find: jest.fn().mockResolvedValue({ items, hasNext: () => false }),
  };
  wixData.query.mockReturnValue(query);
  return { query, calls };
};

beforeEach(() => {
  wixData.query.mockReset();
  wixData.search.mockReset();
});

// ─── Consistency: must not read the eventually-consistent search index ──
// Monday 12704828240 - a member's saved booking link rendered on the directory
// (which uses query()) but not on their profile page, which resolved the member
// through this function. search() reads the full-text index and is eventually
// consistent; the uniqueness paths (ensureUniqueUrl, checkUrlUniqueness) call
// this too, where a stale read can hand out an already-taken slug.

describe('getMemberBySlug - data source', () => {
  it('reads through query(), never through the search index', async () => {
    mockQueryReturning([{ url: 'dianesheridan', memberId: 949741 }]);

    await getMemberBySlug({ slug: 'dianesheridan' });

    expect(wixData.query).toHaveBeenCalledTimes(1);
    expect(wixData.search).not.toHaveBeenCalled();
  });

  it('filters on url in the database rather than scanning everything', async () => {
    const { calls } = mockQueryReturning([{ url: 'dianesheridan', memberId: 949741 }]);

    await getMemberBySlug({ slug: 'dianesheridan' });

    expect(calls.contains).toEqual([['url', 'dianesheridan']]);
  });
});

// ─── Matching behaviour preserved from the search() implementation ───────

describe('getMemberBySlug - matching', () => {
  it('returns the exact slug match and ignores longer urls that merely contain it', async () => {
    mockQueryReturning([
      { url: 'dianesheridanmassage', memberId: 1 },
      { url: 'dianesheridan', memberId: 949741 },
    ]);

    const member = await getMemberBySlug({ slug: 'dianesheridan' });

    expect(member.memberId).toBe(949741);
  });

  it('matches case-insensitively, since stored slugs are mixed case', async () => {
    mockQueryReturning([{ url: 'AlisaDanaeKnowles', memberId: 1529646 }]);

    const member = await getMemberBySlug({ slug: 'alisadanaeknowles' });

    expect(member.memberId).toBe(1529646);
  });

  it('returns null when nothing matches', async () => {
    mockQueryReturning([{ url: 'someoneelse', memberId: 1 }]);

    expect(await getMemberBySlug({ slug: 'dianesheridan' })).toBeNull();
  });

  it('returns null for an empty slug without querying at all', async () => {
    mockQueryReturning([]);

    expect(await getMemberBySlug({ slug: '' })).toBeNull();
    expect(wixData.query).not.toHaveBeenCalled();
  });
});

// ─── Filter options ─────────────────────────────────────────────────────

describe('getMemberBySlug - filter options', () => {
  it('excludes dropped members by default', async () => {
    const { calls } = mockQueryReturning([{ url: 'x', memberId: 1 }]);

    await getMemberBySlug({ slug: 'x' });

    expect(calls.ne).toContainEqual(['action', 'drop']);
  });

  it('keeps dropped members when excludeDropped is false', async () => {
    const { calls } = mockQueryReturning([{ url: 'x', memberId: 1 }]);

    await getMemberBySlug({ slug: 'x', excludeDropped: false });

    expect(calls.ne).not.toContainEqual(['action', 'drop']);
  });

  it('excludes the member being checked when resolving slug uniqueness', async () => {
    const { calls } = mockQueryReturning([{ url: 'x', memberId: 1 }]);

    await getMemberBySlug({ slug: 'x', excludeSearchedMember: true, memberId: 42 });

    expect(calls.ne).toContainEqual(['memberId', 42]);
  });
});

// ─── Counter handling, used by ensureUniqueUrl ──────────────────────────

describe('getMemberBySlug - normalizeSlugForComparison', () => {
  it('returns the highest counter so a new slug does not collide', async () => {
    mockQueryReturning([
      { url: 'john-2', memberId: 2 },
      { url: 'john-11', memberId: 11 },
      { url: 'john', memberId: 1 },
    ]);

    const member = await getMemberBySlug({ slug: 'john', normalizeSlugForComparison: true });

    expect(member.url).toBe('john-11');
  });

  it('tolerates duplicates instead of throwing, so the sync is not blocked', async () => {
    mockQueryReturning([
      { url: 'john', memberId: 1 },
      { url: 'john', memberId: 2 },
    ]);

    const member = await getMemberBySlug({ slug: 'john', normalizeSlugForComparison: true });

    expect(member).not.toBeNull();
  });

  it('surfaces duplicate exact slugs on the render path', async () => {
    mockQueryReturning([
      { url: 'john', memberId: 1 },
      { url: 'john', memberId: 2 },
    ]);

    await expect(getMemberBySlug({ slug: 'john' })).rejects.toThrow(/Multiple members found/);
  });
});
