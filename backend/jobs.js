const { taskManager } = require('psdev-task-manager');

const { scheduleDailyPullTasks } = require('./daily-pull/schedule-methods');
const { TASKS_NAMES } = require('./tasks/consts');
const { dailyPullExecutionCheck } = require('./tasks/daily-pull-check-methods');
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

    return await scheduleDailyPullTasks({ backupDate, isTestEnvironment, includeNone });
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

async function scheduleFixUrlsWithSpacesTask() {
  try {
    console.log('scheduleFixUrlsWithSpaces started!');
    return await taskManager().schedule({
      name: TASKS_NAMES.scheduleFixUrlsWithSpaces,
      data: {},
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleFixUrlsWithSpaces: ${error.message}`);
    throw new Error(`Failed to scheduleFixUrlsWithSpaces: ${error.message}`);
  }
}

async function scheduleNormalizeMemberEmailsTask() {
  try {
    console.log('scheduleNormalizeMemberEmails started!');
    return await taskManager().schedule({
      name: TASKS_NAMES.scheduleNormalizeMemberEmails,
      data: {},
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleNormalizeMemberEmails: ${error.message}`);
    throw new Error(`Failed to scheduleNormalizeMemberEmails: ${error.message}`);
  }
}

/**
 * Schedules setting ALL addresses for ALL members that have any address to STATE_CITY_ZIP
 * (show city/state/zip, hide the street). Manually triggered one-off maintenance task.
 */
async function scheduleSetAddressesToCityStateTask() {
  try {
    console.log('scheduleSetAddressesToCityState started!');
    return await taskManager().schedule({
      name: TASKS_NAMES.scheduleSetAddressesToCityState,
      data: {},
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleSetAddressesToCityState: ${error.message}`);
    throw new Error(`Failed to scheduleSetAddressesToCityState: ${error.message}`);
  }
}

/**
 * Runs the daily pull execution check (watchdog).
 * @param {Object} [options]
 * @param {number} [options.hoursBack=4] - Lookback window in hours
 * @param {boolean} [options.isTestEnvironment=false] - Pull from the test PAC API if the fallback fires
 * @param {boolean} [options.includeNone=false] - Include the NONE action if the fallback fires
 * @returns {Promise<Object>} - Check result
 */
async function runDailyPullExecutionCheck(options = {}) {
  try {
    console.log('runDailyPullExecutionCheck started!');
    return await dailyPullExecutionCheck(options || {});
  } catch (error) {
    console.error(`Failed to runDailyPullExecutionCheck: ${error.message}`);
    throw new Error(`Failed to runDailyPullExecutionCheck: ${error.message}`);
  }
}

/**
 * One-off backfill of associationExpiration. Run with `{ dryRun: true }` first to get the count of
 * members that resolve to no date, and would therefore be hidden, without writing anything.
 * @param {Object} [options]
 * @param {boolean} [options.dryRun]
 */
async function scheduleAssociationExpiryBackfillTask(options = {}) {
  try {
    const { dryRun = false } = options || {};
    console.log(`scheduleAssociationExpiryBackfill started! dryRun=${dryRun}`);
    return await taskManager().schedule({
      name: TASKS_NAMES.scheduleAssociationExpiryBackfill,
      data: { dryRun },
      type: 'scheduled',
    });
  } catch (error) {
    console.error(`Failed to scheduleAssociationExpiryBackfill: ${error.message}`);
    throw new Error(`Failed to scheduleAssociationExpiryBackfill: ${error.message}`);
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
  scheduleFixUrlsWithSpacesTask,
  scheduleNormalizeMemberEmailsTask,
  scheduleSetAddressesToCityStateTask,
  scheduleAssociationExpiryBackfillTask,
  runDailyPullExecutionCheck,
};
