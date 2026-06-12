const { COLLECTIONS } = require('psdev-task-manager/public/consts');

const { scheduleDailyPullTasks } = require('../daily-pull/schedule-methods');
const { wixData } = require('../elevated-modules');
const { queryAllItems } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const DEFAULT_HOURS_BACK = 4;

// The cron path (scheduleDailyPullTask) creates ScheduleMembersDataPerAction tasks
// directly; ScheduleDailyMembersDataSync only exists when the pull is triggered via
// the root task. Either one in the window is evidence the daily pull was scheduled.
const DAILY_PULL_TASK_NAMES = [
  TASKS_NAMES.ScheduleMembersDataPerAction,
  TASKS_NAMES.ScheduleDailyMembersDataSync,
];

/**
 * Detects whether the daily pull was scheduled in the lookback window.
 * If no daily pull task exists, re-schedules the same per-action tasks the cron
 * would have created, propagating the environment flags from the task data so a
 * test site's fallback pulls from the test PAC API.
 * @param {Object} [taskData]
 * @param {number} [taskData.hoursBack=4] - Lookback window in hours
 * @param {boolean} [taskData.isTestEnvironment=false] - Pull from the test PAC API on fallback
 * @param {boolean} [taskData.includeNone=false] - Include the NONE action on fallback
 * @returns {Promise<Object>} - Check result
 */
async function dailyPullExecutionCheck(taskData) {
  const hoursBack =
    taskData?.hoursBack && Number.isFinite(taskData.hoursBack)
      ? taskData.hoursBack
      : DEFAULT_HOURS_BACK;
  const isTestEnvironment = Boolean(taskData?.isTestEnvironment);
  const includeNone = Boolean(taskData?.includeNone);
  const sinceDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  console.log('dailyPullExecutionCheck started', {
    hoursBack,
    sinceDate,
    isTestEnvironment,
    includeNone,
  });

  const dailyPullTasksQuery = wixData
    .query(COLLECTIONS.TASKS)
    .hasSome('name', DAILY_PULL_TASK_NAMES)
    .ge('_createdDate', sinceDate);

  const dailyPullTasks = await queryAllItems(dailyPullTasksQuery);
  const dailyPullScheduled = dailyPullTasks.length > 0;

  const result = {
    success: dailyPullScheduled,
    sinceDate: sinceDate.toISOString(),
    checkedTaskNames: DAILY_PULL_TASK_NAMES,
    dailyPullTasksFound: dailyPullTasks.length,
  };

  if (!dailyPullScheduled) {
    console.log('No daily pull tasks found in window; re-scheduling per-action pull tasks', {
      hoursBack,
      isTestEnvironment,
      includeNone,
    });
    await scheduleDailyPullTasks({ isTestEnvironment, includeNone });
    result.fallbackScheduled = true;
  }

  console.log('dailyPullExecutionCheck result', JSON.stringify(result, null, 2));

  return result;
}

module.exports = {
  dailyPullExecutionCheck,
};
