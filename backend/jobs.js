const { taskManager } = require('psdev-task-manager');

const { TASKS, TASKS_NAMES } = require('./tasks');

async function runScheduledTasks() {
  try {
    console.log('runScheduledTasks started');
    return await taskManager().runScheduledTasks(TASKS);
  } catch (error) {
    console.error(`Failed to runScheduledTasks: ${error.message}`);
    throw new Error(`Failed to runScheduledTasks: ${error.message}`);
  }
}

async function scheduleDailyPullTask() {
  try {
    console.log('scheduleDailyPullTask started!');
    return await taskManager().schedule({
      name: TASKS_NAMES.ScheduleDailyMembersDataSync,
      data: {},
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleDailyPullTask: ${error.message}`);
    throw new Error(`Failed to scheduleDailyPullTask: ${error.message}`);
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

module.exports = { runScheduledTasks, scheduleDailyPullTask, updateSiteMapS3 };
