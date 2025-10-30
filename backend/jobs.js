const { taskManager } = require('psdev-task-manager');

const { TASKS_NAMES } = require('./consts');
const { TASKS } = require('./tasks');

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

module.exports = { runScheduledTasks, scheduleDailyPullTask };
