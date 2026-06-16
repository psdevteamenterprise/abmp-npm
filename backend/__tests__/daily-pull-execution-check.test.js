jest.mock('../elevated-modules', () => ({
  wixData: { query: jest.fn() },
}));
jest.mock('psdev-task-manager', () => ({ taskManager: jest.fn() }));

const { taskManager } = require('psdev-task-manager');

const { buildDailyPullTasks } = require('../daily-pull/schedule-methods');
const { wixData } = require('../elevated-modules');
const { TASKS_NAMES } = require('../tasks/consts');
const { dailyPullExecutionCheck } = require('../tasks/daily-pull-check-methods');

const makeQueryResult = items => ({ items, hasNext: () => false });

const mockTasksQuery = items => {
  const query = {
    hasSome: jest.fn().mockReturnThis(),
    ge: jest.fn().mockReturnThis(),
    find: jest.fn().mockResolvedValue(makeQueryResult(items)),
  };
  wixData.query.mockReturnValue(query);
  return query;
};

describe('buildDailyPullTasks', () => {
  test('schedules one ScheduleMembersDataPerAction task per action, excluding none by default', () => {
    const tasks = buildDailyPullTasks();

    expect(tasks.map(task => task.data.action).sort()).toEqual(['drop', 'new', 'update']);
    tasks.forEach(task => {
      expect(task.name).toBe(TASKS_NAMES.ScheduleMembersDataPerAction);
      expect(task.type).toBe('scheduled');
      expect(task.data).toEqual({ action: task.data.action });
    });
  });

  test('includes the none action and flag when includeNone is set', () => {
    const tasks = buildDailyPullTasks({ includeNone: true });

    expect(tasks.map(task => task.data.action).sort()).toEqual(['drop', 'new', 'none', 'update']);
    tasks.forEach(task => expect(task.data.includeNone).toBe(true));
  });

  test('propagates isTestEnvironment and backupDate to every task', () => {
    const tasks = buildDailyPullTasks({ isTestEnvironment: true, backupDate: '2026-06-01' });

    tasks.forEach(task => {
      expect(task.data.isTestEnvironment).toBe(true);
      expect(task.data.backupDate).toBe('2026-06-01');
    });
  });
});

describe('dailyPullExecutionCheck', () => {
  let scheduleInBulk;

  beforeEach(() => {
    wixData.query.mockReset();
    scheduleInBulk = jest.fn().mockResolvedValue(undefined);
    taskManager.mockReturnValue({ scheduleInBulk });
  });

  test('counts the per-action tasks the cron creates as evidence the pull ran', async () => {
    const query = mockTasksQuery([{ name: TASKS_NAMES.ScheduleMembersDataPerAction }]);

    const result = await dailyPullExecutionCheck({});

    expect(query.hasSome).toHaveBeenCalledWith('name', [
      TASKS_NAMES.ScheduleMembersDataPerAction,
      TASKS_NAMES.ScheduleDailyMembersDataSync,
    ]);
    expect(result.success).toBe(true);
    expect(result.fallbackScheduled).toBeUndefined();
    expect(scheduleInBulk).not.toHaveBeenCalled();
  });

  test('schedules the per-action fallback with environment flags when no pull is found', async () => {
    mockTasksQuery([]);

    const result = await dailyPullExecutionCheck({ isTestEnvironment: true, includeNone: true });

    expect(result.success).toBe(false);
    expect(result.fallbackScheduled).toBe(true);
    expect(scheduleInBulk).toHaveBeenCalledTimes(1);
    const scheduledTasks = scheduleInBulk.mock.calls[0][0];
    expect(scheduledTasks.map(task => task.data.action).sort()).toEqual([
      'drop',
      'new',
      'none',
      'update',
    ]);
    scheduledTasks.forEach(task => {
      expect(task.name).toBe(TASKS_NAMES.ScheduleMembersDataPerAction);
      expect(task.data.isTestEnvironment).toBe(true);
      expect(task.data.includeNone).toBe(true);
    });
  });

  test('fallback defaults to production flags when no task data is provided', async () => {
    mockTasksQuery([]);

    await dailyPullExecutionCheck(undefined);

    const scheduledTasks = scheduleInBulk.mock.calls[0][0];
    expect(scheduledTasks.map(task => task.data.action).sort()).toEqual(['drop', 'new', 'update']);
    scheduledTasks.forEach(task => {
      expect(task.data.isTestEnvironment).toBeUndefined();
      expect(task.data.includeNone).toBeUndefined();
    });
  });

  test('uses the provided lookback window', async () => {
    const query = mockTasksQuery([{ name: TASKS_NAMES.ScheduleDailyMembersDataSync }]);
    const before = Date.now();

    const result = await dailyPullExecutionCheck({ hoursBack: 12 });

    const sinceDate = query.ge.mock.calls[0][1];
    expect(query.ge).toHaveBeenCalledWith('_createdDate', expect.any(Date));
    const expectedSince = before - 12 * 60 * 60 * 1000;
    expect(Math.abs(sinceDate.getTime() - expectedSince)).toBeLessThan(5000);
    expect(result.success).toBe(true);
  });
});
