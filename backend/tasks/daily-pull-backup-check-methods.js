const { taskManager } = require('psdev-task-manager');
const { COLLECTIONS } = require('psdev-task-manager/public/consts');

const { MEMBER_ACTIONS } = require('../daily-pull/consts');
const { wixData } = require('../elevated-modules');
const { queryAllItems } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const DEFAULT_HOURS_BACK = 4;

const getActionsToCheck = includeNone =>
  includeNone
    ? Object.values(MEMBER_ACTIONS)
    : Object.values(MEMBER_ACTIONS).filter(action => action !== MEMBER_ACTIONS.NONE);

/**
 * Schedules an execution check for daily pull status.
 */
async function scheduleDailyPullExecutionCheck() {
  try {
    console.log('scheduleDailyPullExecutionCheck started!');
    return await taskManager().schedule({
      name: TASKS_NAMES.dailyPullExecutionCheck,
      data: { hoursBack: DEFAULT_HOURS_BACK, includeNone: false },
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleDailyPullExecutionCheck: ${error.message}`);
    throw new Error(`Failed to scheduleDailyPullExecutionCheck: ${error.message}`);
  }
}

/**
 * Verifies ScheduleMembersDataPerAction tasks exist and succeeded per action.
 */
async function dailyPullExecutionCheck(taskData) {
  const hoursBack =
    taskData?.hoursBack && Number.isFinite(taskData.hoursBack)
      ? taskData.hoursBack
      : DEFAULT_HOURS_BACK;
  const includeNone = Boolean(taskData?.includeNone);
  const sinceDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  console.log('dailyPullExecutionCheck started', { hoursBack, sinceDate });

  const tasksQuery = wixData
    .query(COLLECTIONS.TASKS)
    .eq('name', TASKS_NAMES.ScheduleMembersDataPerAction)
    .ge('_createdDate', sinceDate)
    .limit(1000);

  const tasks = await queryAllItems(tasksQuery);
  const actionsToCheck = getActionsToCheck(includeNone);

  const statusByAction = actionsToCheck.reduce((acc, action) => {
    acc[action] = { success: 0, failed: 0, pending: 0, in_progress: 0, skipped: 0 };
    return acc;
  }, {});

  tasks.forEach(task => {
    const action = task?.data?.action;
    if (!action || !(action in statusByAction)) {
      return;
    }
    const status = task?.status || 'unknown';
    if (!statusByAction[action][status]) {
      statusByAction[action][status] = 0;
    }
    statusByAction[action][status] += 1;
  });

  const missingActions = actionsToCheck.filter(
    action => (statusByAction[action]?.success || 0) === 0
  );

  const result = {
    success: missingActions.length === 0,
    sinceDate: sinceDate.toISOString(),
    actionsChecked: actionsToCheck,
    missingActions,
    statusByAction,
    totalTasksFound: tasks.length,
  };

  if (missingActions.length > 0) {
    console.log('Missing daily pull actions detected, scheduling fallback daily pull run', {
      missingActions,
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
  scheduleDailyPullExecutionCheck,
  dailyPullExecutionCheck,
};
