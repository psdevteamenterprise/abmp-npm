const {
  scheduleAssociationExpiryBackfill,
} = require('../tasks/association-expiry-backfill-methods');

// ─── Monday 12423706293 ──────────────────────────────────────────────
// The task manager calls process() with whatever getIdentifier returns, not with the task. Several
// existing tasks use `getIdentifier: () => 'SHOULD_NEVER_SKIP'`, which is harmless for a process
// function that takes no arguments - but this one takes { dryRun }. Handed that string, a naive
// destructure yields dryRun: undefined, which reads as false, and the dry run PAC is waiting on
// would instead write to all ~187k members. The failure is silent and unrecoverable, so the
// function refuses input it cannot read rather than assuming the destructive default.
// See PLAN-per-association-expiry.md.

describe('scheduleAssociationExpiryBackfill - refuses input it cannot read', () => {
  it.each([
    ['the sentinel string other tasks use', 'SHOULD_NEVER_SKIP'],
    ['any other string', 'anything'],
    ['null', null],
    ['a number', 1],
  ])('rejects %s rather than defaulting to a live write', async (_label, value) => {
    await expect(scheduleAssociationExpiryBackfill(value)).rejects.toThrow(
      /expected its task data object/
    );
  });

  it('names the exact thing to fix, since the symptom is invisible', async () => {
    await expect(scheduleAssociationExpiryBackfill('SHOULD_NEVER_SKIP')).rejects.toThrow(
      /getIdentifier.*must be `task => task\.data`/s
    );
  });

  it('fails before touching any data', async () => {
    // The guard runs ahead of the site config read and the member fetch, so a misconfigured task
    // cannot get far enough to write. If this ever reaches Wix it throws a different error.
    await expect(scheduleAssociationExpiryBackfill('SHOULD_NEVER_SKIP')).rejects.toThrow(
      /expected its task data object/
    );
  });
});
