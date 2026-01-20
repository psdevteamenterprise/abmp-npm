const { taskManager } = require('psdev-task-manager');

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
 * Schedule a daily pull task for the given backup date
 * @param {string} backupDate - Optional. The date of the backup to pull in format YYYY-MM-DD
 * @returns {Promise<void>}
 */
async function scheduleDailyPullTask(backupDate = null) {
  try {
    console.log('scheduleDailyPullTask started!');
    console.log(`backupDate: ${backupDate}`);
    return await taskManager().schedule({
      name: TASKS_NAMES.ScheduleDailyMembersDataSync,
      data: backupDate ? { backupDate } : {}, // keeping it like this so it would be easier to understand which task was backed up which is not while looking into CMS.
      type: 'scheduled',
    });
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
