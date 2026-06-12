jest.mock('../elevated-modules', () => ({
  wixData: { query: jest.fn() },
}));

const { wixData } = require('../elevated-modules');
const { findMembersByIds } = require('../members-data-methods');
const { withTransientErrorRetry, isTransientNetworkError } = require('../utils');

const makeQueryResult = items => ({ items, hasNext: () => false });

const mockQueryReturning = find => {
  const query = {
    hasSome: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    find,
  };
  wixData.query.mockReturnValue(query);
  return query;
};

describe('isTransientNetworkError', () => {
  test('matches undici "fetch failed" and common network error codes', () => {
    expect(isTransientNetworkError(new Error('fetch failed'))).toBe(true);
    expect(isTransientNetworkError({ message: 'request failed', code: 'ECONNRESET' })).toBe(true);
    expect(
      isTransientNetworkError({ message: 'fetch failed', cause: { code: 'UND_ERR_SOCKET' } })
    ).toBe(true);
  });

  test('does not match application errors', () => {
    expect(isTransientNetworkError(new Error('Multiple members found with memberId 1'))).toBe(
      false
    );
    expect(isTransientNetworkError(new Error('WDE0025: validation failed'))).toBe(false);
  });
});

describe('withTransientErrorRetry', () => {
  test('retries transient failures and resolves with the eventual result', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce('ok');

    await expect(withTransientErrorRetry(operation, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('rethrows immediately on non-transient errors', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('validation failed'));

    await expect(withTransientErrorRetry(operation, { baseDelayMs: 1 })).rejects.toThrow(
      'validation failed'
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test('gives up after the configured number of retries', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('fetch failed'));

    await expect(
      withTransientErrorRetry(operation, { retries: 2, baseDelayMs: 1 })
    ).rejects.toThrow('fetch failed');
    expect(operation).toHaveBeenCalledTimes(3);
  });
});

describe('findMembersByIds', () => {
  beforeEach(() => {
    wixData.query.mockReset();
  });

  test('returns a map of String(memberId) to member record', async () => {
    mockQueryReturning(
      jest.fn().mockResolvedValue(
        makeQueryResult([
          { _id: 'a', memberId: 1 },
          { _id: 'b', memberId: 2 },
        ])
      )
    );

    const membersById = await findMembersByIds([1, 2, 3]);

    expect(membersById.get('1')).toEqual({ _id: 'a', memberId: 1 });
    expect(membersById.get('2')).toEqual({ _id: 'b', memberId: 2 });
    expect(membersById.has('3')).toBe(false);
  });

  test('deduplicates input IDs and skips null/undefined before querying', async () => {
    const query = mockQueryReturning(jest.fn().mockResolvedValue(makeQueryResult([])));

    await findMembersByIds([1, 1, null, undefined, 2]);

    expect(query.hasSome).toHaveBeenCalledWith('memberId', [1, 2]);
  });

  test('returns an empty map without querying when there are no IDs', async () => {
    const membersById = await findMembersByIds([]);

    expect(membersById.size).toBe(0);
    expect(wixData.query).not.toHaveBeenCalled();
  });

  test('chunks large ID lists into multiple queries', async () => {
    const query = mockQueryReturning(jest.fn().mockResolvedValue(makeQueryResult([])));
    const ids = Array.from({ length: 250 }, (_, i) => i + 1);

    await findMembersByIds(ids);

    expect(query.hasSome).toHaveBeenCalledTimes(3);
    expect(query.hasSome.mock.calls.map(call => call[1].length)).toEqual([100, 100, 50]);
  });

  test('throws when multiple records share the same memberId', async () => {
    mockQueryReturning(
      jest.fn().mockResolvedValue(
        makeQueryResult([
          { _id: 'a', memberId: 1 },
          { _id: 'b', memberId: 1 },
        ])
      )
    );

    await expect(findMembersByIds([1])).rejects.toThrow(
      'Multiple members found with memberId(s): [1]'
    );
  });
});
