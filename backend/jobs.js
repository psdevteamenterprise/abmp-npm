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
 * @param {string|Object} [options] - Optional. Either a backup date (YYYY-MM-DD) or options.
 * @param {string} [options.backupDate] - Optional backup date to pull.
 * @param {boolean} [options.isTestEnvironment=false] - Whether to use test environment.
 * @param {boolean} [options.includeNone=false] - Whether to include NONE action.
 * @returns {Promise<void>}
 */
async function scheduleDailyPullTask(options = null) {
  try {
    console.log('scheduleDailyPullTask started!');
    const hasOptions = options && typeof options === 'object' && !Array.isArray(options);
    const backupDate = hasOptions ? options.backupDate : options;
    const isTestEnvironment = hasOptions ? Boolean(options.isTestEnvironment) : false;
    const includeNone = hasOptions ? Boolean(options.includeNone) : false;
    console.log(`backupDate: ${backupDate}`);
    console.log(`isTestEnvironment: ${isTestEnvironment}`);
    console.log(`includeNone: ${includeNone}`);

    const actionsToSync = includeNone
      ? Object.values(MEMBER_ACTIONS)
      : Object.values(MEMBER_ACTIONS).filter(action => action !== MEMBER_ACTIONS.NONE);
    const toScheduleTasks = actionsToSync.map(action => ({
      name: TASKS_NAMES.ScheduleMembersDataPerAction,
      data: {
        action,
        ...(backupDate ? { backupDate } : {}),
        ...(isTestEnvironment ? { isTestEnvironment } : {}),
        ...(includeNone ? { includeNone } : {}),
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

async function scheduleFixPrimaryAddressForMembersTask() {
  try {
    console.log('scheduleFixPrimaryAddressForMembers started!');
    return await taskManager().schedule({
      name: TASKS_NAMES.scheduleFixPrimaryAddressForMembers,
      data: {},
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleFixPrimaryAddressForMembers: ${error.message}`);
    throw new Error(`Failed to scheduleFixPrimaryAddressForMembers: ${error.message}`);
  }
}

async function scheduleFixPrimaryAddressVisibilityForMembersTask() {
  try {
    console.log('scheduleFixPrimaryAddressVisibilityForMembers started!');
    return await taskManager().schedule({
      name: TASKS_NAMES.scheduleFixPrimaryAddressVisibilityForMembers,
      data: {},
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleFixPrimaryAddressVisibilityForMembers: ${error.message}`);
    throw new Error(`Failed to scheduleFixPrimaryAddressVisibilityForMembers: ${error.message}`);
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
  scheduleFixPrimaryAddressForMembersTask,
  scheduleFixPrimaryAddressVisibilityForMembersTask,
};
