const { taskManager } = require('psdev-task-manager');

const { TASKS_NAMES } = require('../tasks/consts');

const { MEMBER_ACTIONS } = require('./consts');

/**
 * Builds the per-action daily pull tasks. Single source of truth for what a
 * "daily pull" schedules, shared by the cron job and the execution-check
 * fallback so both produce identical tasks (same names, same environment flags).
 * @param {Object} [options]
 * @param {string} [options.backupDate] - Optional backup date (YYYY-MM-DD) to pull from the backup endpoint
 * @param {boolean} [options.isTestEnvironment=false] - Whether to pull from the test PAC API
 * @param {boolean} [options.includeNone=false] - Whether to also sync the NONE action
 * @returns {Array<Object>} - Task definitions for taskManager().scheduleInBulk
 */
const buildDailyPullTasks = ({ backupDate, isTestEnvironment, includeNone } = {}) => {
  const actionsToSync = includeNone
    ? Object.values(MEMBER_ACTIONS)
    : Object.values(MEMBER_ACTIONS).filter(action => action !== MEMBER_ACTIONS.NONE);
  return actionsToSync.map(action => ({
    name: TASKS_NAMES.ScheduleMembersDataPerAction,
    data: {
      action,
      ...(backupDate ? { backupDate } : {}),
      ...(isTestEnvironment ? { isTestEnvironment } : {}),
      ...(includeNone ? { includeNone } : {}),
    },
    type: 'scheduled',
  }));
};

/**
 * Schedules the daily pull (one ScheduleMembersDataPerAction task per action).
 * @param {Object} [options] - Same options as buildDailyPullTasks
 * @returns {Promise<any>}
 */
const scheduleDailyPullTasks = options =>
  taskManager().scheduleInBulk(buildDailyPullTasks(options));

module.exports = { buildDailyPullTasks, scheduleDailyPullTasks };
