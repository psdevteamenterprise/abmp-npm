const { taskManager } = require('psdev-task-manager');

const { TASKS_NAMES } = require('./consts');

//this will be run only once by the developers during the migration
function scheduleConvertHtmlToRichContent() {
  return taskManager().schedule({
    name: TASKS_NAMES.scheduleTaskForEmptyAboutYouMembers,
    data: {},
    type: 'scheduled',
  });
}

// This function is used to migrate external profile images to Wix-hosted images
function scheduleExternalProfileImageMigration() {
  return taskManager().schedule({
    name: TASKS_NAMES.scheduleTaskForExternalProfileImages,
    data: {},
    type: 'scheduled',
  });
}

// Schedule URL migration from backup collection
function scheduleUrlMigration() {
  return taskManager().schedule({
    name: TASKS_NAMES.scheduleMigrateExistingUrls,
    data: {},
    type: 'scheduled',
  });
}

// Schedule URL generation for members without URLs
function scheduleUrlGeneration() {
  return taskManager().schedule({
    name: TASKS_NAMES.scheduleGenerateMissingUrls,
    data: {},
    type: 'scheduled',
  });
}

module.exports = {
  scheduleConvertHtmlToRichContent,
  scheduleExternalProfileImageMigration,
  scheduleUrlMigration,
  scheduleUrlGeneration,
};
