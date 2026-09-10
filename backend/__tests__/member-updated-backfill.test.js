const { MEMBER_UPDATED_FIELD } = require('../listing-priority');
const membersDataMethods = require('../members-data-methods');
const {
  scheduleMemberUpdatedBackfill,
  memberUpdatedBackfillChunk,
} = require('../tasks/member-updated-backfill-methods');

jest.mock('../members-data-methods');

const mockSchedule = jest.fn();
jest.mock('psdev-task-manager', () => ({ taskManager: () => ({ schedule: mockSchedule }) }));

const withContent = memberId => ({ memberId, _id: `id-${memberId}`, businessName: 'Jane Massage' });
const bare = memberId => ({ memberId, _id: `id-${memberId}` });
const flagged = memberId => ({ ...withContent(memberId), [MEMBER_UPDATED_FIELD]: true });

beforeEach(() => {
  mockSchedule.mockReset();
  membersDataMethods.getAllMembers.mockReset();
  membersDataMethods.getMembersByIds.mockReset();
  membersDataMethods.bulkSaveMembers.mockReset();
  membersDataMethods.bulkSaveMembers.mockResolvedValue({});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('scheduleMemberUpdatedBackfill', () => {
  test('a dry run writes nothing and schedules nothing', async () => {
    membersDataMethods.getAllMembers.mockResolvedValue([
      withContent(1),
      withContent(2),
      flagged(3),
      bare(4),
    ]);

    const summary = await scheduleMemberUpdatedBackfill({ dryRun: true });

    expect(mockSchedule).not.toHaveBeenCalled();
    expect(membersDataMethods.bulkSaveMembers).not.toHaveBeenCalled();
    expect(summary.dryRun).toBe(true);
    expect(summary.outcomes.tierOne).toBe(3);
    expect(summary.outcomes.tierTwo).toBe(1);
    expect(summary.membersNeedingUpdate).toBe(2);
    expect(summary.tierOneShare).toBe('75.0%');
  });

  test('a real run schedules one chunk per 1000 members needing the flag', async () => {
    const members = Array.from({ length: 2500 }, (_, i) => withContent(i + 1));
    membersDataMethods.getAllMembers.mockResolvedValue(members);

    const summary = await scheduleMemberUpdatedBackfill({});

    expect(summary.tasksScheduled).toBe(3);
    expect(mockSchedule).toHaveBeenCalledTimes(3);
    const sizes = mockSchedule.mock.calls.map(([task]) => task.data.memberIds.length);
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  test('already-flagged members are not rescheduled', async () => {
    membersDataMethods.getAllMembers.mockResolvedValue([flagged(1), flagged(2)]);

    const summary = await scheduleMemberUpdatedBackfill({});

    expect(mockSchedule).not.toHaveBeenCalled();
    expect(summary.membersNeedingUpdate).toBe(0);
    expect(summary.message).toMatch(/already flagged/);
  });

  test('an empty collection reports zero rather than dividing by it', async () => {
    membersDataMethods.getAllMembers.mockResolvedValue([]);

    const summary = await scheduleMemberUpdatedBackfill({ dryRun: true });

    expect(summary.tierOneShare).toBe('0.0%');
    expect(summary.totalMembers).toBe(0);
  });

  // getIdentifier must be `task => task.data`. If it returns a string instead, process() would
  // receive that string, `data.dryRun` would read undefined, and the run would write to every
  // member while the caller believed they had asked for a count.
  test('refuses to run when handed something other than its data object', async () => {
    await expect(scheduleMemberUpdatedBackfill('scheduleMemberUpdatedBackfill')).rejects.toThrow(
      /getIdentifier/
    );
    expect(membersDataMethods.getAllMembers).not.toHaveBeenCalled();
  });
});

describe('memberUpdatedBackfillChunk', () => {
  const chunk = memberIds => ({ memberIds, chunkIndex: 0, totalChunks: 1 });

  test('sets the flag on members with content and leaves the rest alone', async () => {
    membersDataMethods.getMembersByIds.mockResolvedValue([withContent(1), bare(2), flagged(3)]);

    const result = await memberUpdatedBackfillChunk(chunk([1, 2, 3]));

    expect(result.successful).toBe(1);
    expect(result.skipped).toBe(2);
    const [saved] = membersDataMethods.bulkSaveMembers.mock.calls[0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ memberId: 1, [MEMBER_UPDATED_FIELD]: true });
  });

  test('the write preserves the rest of the record', async () => {
    membersDataMethods.getMembersByIds.mockResolvedValue([
      { ...withContent(1), url: 'jane-doe', optOut: true },
    ]);

    await memberUpdatedBackfillChunk(chunk([1]));

    const [[saved]] = membersDataMethods.bulkSaveMembers.mock.calls;
    expect(saved[0]).toMatchObject({ url: 'jane-doe', optOut: true, businessName: 'Jane Massage' });
  });

  // A chunk can run long after it was scheduled, so the member is re-read rather than trusted.
  test('a member who saved between scheduling and running is skipped, not rewritten', async () => {
    membersDataMethods.getMembersByIds.mockResolvedValue([flagged(1)]);

    const result = await memberUpdatedBackfillChunk(chunk([1]));

    expect(result.skipped).toBe(1);
    expect(membersDataMethods.bulkSaveMembers).not.toHaveBeenCalled();
  });

  test('a failed bulk save reports the ids rather than swallowing them', async () => {
    membersDataMethods.getMembersByIds.mockResolvedValue([withContent(1), withContent(2)]);
    membersDataMethods.bulkSaveMembers.mockRejectedValue(new Error('collection unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await memberUpdatedBackfillChunk(chunk([1, 2]));

    expect(result.failed).toBe(2);
    expect(result.failedIds).toEqual([1, 2]);
    expect(result.errors[0].error).toBe('collection unavailable');
  });
});
