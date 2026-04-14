const { taskManager } = require('psdev-task-manager');
const { COLLECTIONS } = require('psdev-task-manager/public/consts');

const { wixData } = require('../elevated-modules');
const { queryAllItems } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const DEFAULT_HOURS_BACK = 4;

/**
 * Detects whether the daily pull was scheduled (cron / root task).
 * If no `ScheduleDailyMembersDataSync` task exists in the lookback window, schedules it.
 */
async function dailyPullExecutionCheck(taskData) {
  const hoursBack =
    taskData?.hoursBack && Number.isFinite(taskData.hoursBack)
      ? taskData.hoursBack
      : DEFAULT_HOURS_BACK;
  const sinceDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  console.log('dailyPullExecutionCheck started', { hoursBack, sinceDate });

  const rootTasksQuery = wixData
    .query(COLLECTIONS.TASKS)
    .eq('name', TASKS_NAMES.ScheduleDailyMembersDataSync)
    .ge('_createdDate', sinceDate)
    .limit(1000);

  const rootTasks = await queryAllItems(rootTasksQuery);
  const rootTaskScheduled = rootTasks.length > 0;

  const result = {
    success: rootTaskScheduled,
    sinceDate: sinceDate.toISOString(),
    rootTaskName: TASKS_NAMES.ScheduleDailyMembersDataSync,
    rootTasksFound: rootTasks.length,
  };

  if (!rootTaskScheduled) {
    console.log('ScheduleDailyMembersDataSync missing in window; scheduling root daily pull', {
      hoursBack,
    });
    await taskManager().schedule({
      name: TASKS_NAMES.ScheduleDailyMembersDataSync,
      data: {},
      type: 'scheduled',
    });
    result.fallbackScheduled = true;
  }

  console.log('dailyPullExecutionCheck result', JSON.stringify(result, null, 2));

  return result;
}

module.exports = {
  dailyPullExecutionCheck,
};
