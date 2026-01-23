const { taskManager } = require('psdev-task-manager');

const { MEMBER_ACTIONS } = require('./daily-pull/consts');
const { TASKS_NAMES } = require('./tasks/consts');
const { TASKS } = require('./tasks/tasks-configs');

async function runScheduledTasks() {
  try {
    console.log('runScheduledTasks started');
    return await taskManager().runScheduledTasks(TASKS);
  } catch (error) {
    console.error(`Failed to runScheduledTasks: ${error.message}`);
    throw new Error(`Failed to runScheduledTasks: ${error.message}`);
  }
}

/**
 * Schedule daily pull tasks for all member actions.
 * @param {string|Object} [optionsOrBackupDate] - Optional. Either a backup date (YYYY-MM-DD) or options.
 * @param {string} [optionsOrBackupDate.backupDate] - Optional backup date to pull.
 * @param {boolean} [optionsOrBackupDate.isTestEnvironment=false] - Whether to use test environment.
 * @param {string} [optionsOrBackupDate.pacApiBaseUrl] - Optional PAC API base URL override.
 * @returns {Promise<void>}
 */
async function scheduleDailyPullTask(optionsOrBackupDate = null) {
  try {
    console.log('scheduleDailyPullTask started!');
    const hasOptions =
      optionsOrBackupDate &&
      typeof optionsOrBackupDate === 'object' &&
      !Array.isArray(optionsOrBackupDate);
    const backupDate = hasOptions ? optionsOrBackupDate.backupDate : optionsOrBackupDate;
    const isTestEnvironment = hasOptions ? Boolean(optionsOrBackupDate.isTestEnvironment) : false;
    const pacApiBaseUrl = hasOptions ? optionsOrBackupDate.pacApiBaseUrl : null;
    console.log(`backupDate: ${backupDate}`);
    console.log(`isTestEnvironment: ${isTestEnvironment}`);

    const actionsToSync = Object.values(MEMBER_ACTIONS).filter(
      action => action !== MEMBER_ACTIONS.NONE
    );
    const toScheduleTasks = actionsToSync.map(action => ({
      name: TASKS_NAMES.ScheduleMembersDataPerAction,
      data: {
        action,
        ...(backupDate ? { backupDate } : {}),
        ...(isTestEnvironment ? { isTestEnvironment } : {}),
        ...(pacApiBaseUrl ? { pacApiBaseUrl } : {}),
      },
      type: 'scheduled',
    }));

    return await taskManager().scheduleInBulk(toScheduleTasks);
  } catch (error) {
    console.error(`Failed to scheduleDailyPullTask: ${error.message}`);
    throw new Error(`Failed to scheduleDailyPullTask: ${error.message}`);
  }
}

async function scheduleCreateContactsFromMembersTask() {
  try {
    console.log('scheduleCreateContactsFromMembers started!');
    return await taskManager().schedule({
      name: TASKS_NAMES.scheduleCreateContactsFromMembers,
      data: {},
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleCreateContactsFromMembers: ${error.message}`);
    throw new Error(`Failed to scheduleCreateContactsFromMembers: ${error.message}`);
  }
}

async function updateSiteMapS3() {
  try {
    return await taskManager().schedule({
      name: TASKS_NAMES.updateSiteMapS3,
      data: {},
      type: 'scheduled',
    });
  } catch (error) {
    throw new Error(`Failed to updateSiteMapS3: ${error.message}`);
  }
}

module.exports = {
  runScheduledTasks,
  scheduleDailyPullTask,
  updateSiteMapS3,
  scheduleCreateContactsFromMembersTask,
};
