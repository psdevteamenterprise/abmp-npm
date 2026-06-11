const { LOGIN_EMAIL_SYNC_STATUS } = require('../consts');
const { summarizeLoginEmailOutcomes } = require('../daily-pull/utils');

const { UPDATED, FAILED, SKIPPED } = LOGIN_EMAIL_SYNC_STATUS;

describe('summarizeLoginEmailOutcomes', () => {
  test('collects only FAILED outcomes as failures and failed ids', () => {
    const outcomes = [
      { memberId: 1, wixMemberId: 'w1', desiredEmail: 'a@x.com', status: UPDATED },
      {
        memberId: 2,
        wixMemberId: 'w2',
        desiredEmail: 'b@x.com',
        status: FAILED,
        error: 'duplicate',
      },
      { memberId: 3, status: SKIPPED, desiredEmail: 'c@x.com' },
    ];

    const { failedMemberIds, failures } = summarizeLoginEmailOutcomes(outcomes);

    expect([...failedMemberIds]).toEqual([2]);
    expect(failures).toEqual([
      { memberId: 2, wixMemberId: 'w2', desiredEmail: 'b@x.com', error: 'duplicate' },
    ]);
  });

  test('UPDATED and SKIPPED never produce failures (CMS email is left to advance/no-op)', () => {
    const outcomes = [
      { memberId: 1, status: UPDATED, desiredEmail: 'a@x.com' },
      { memberId: 2, status: SKIPPED, desiredEmail: 'b@x.com' },
    ];
    const { failedMemberIds, failures } = summarizeLoginEmailOutcomes(outcomes);
    expect(failedMemberIds.size).toBe(0);
    expect(failures).toEqual([]);
  });

  test('defaults a missing error message', () => {
    const { failures } = summarizeLoginEmailOutcomes([
      { memberId: 9, wixMemberId: 'w9', desiredEmail: 'z@x.com', status: FAILED },
    ]);
    expect(failures[0].error).toBe('unknown error');
  });

  test('handles empty / missing input', () => {
    expect(summarizeLoginEmailOutcomes([]).failures).toEqual([]);
    expect(summarizeLoginEmailOutcomes().failures).toEqual([]);
  });
});
