const {
  MEMBER_ACTIONS,
  synchronizeSinglePage,
  syncMembersDataPerAction,
} = require('../daily-pull');

const { TASKS_NAMES } = require('./consts');
const {
  scheduleTaskForEmptyAboutYouMembers,
  convertAboutYouHtmlToRichContent,
  compileFiltersOptions,
  scheduleTaskForExternalProfileImages,
  convertExternalProfilesToWixImages,
  updateSiteMapS3,
  scheduleContactFormEmailMigration,
  migrateContactFormEmails,
  scheduleEmailSync,
  syncMemberLoginEmails,
} = require('./tasks-process-methods');

const getDailyMembersDataSyncChildTasks = () => {
  // we don't want to sync none action as it means this members data hasn't changed and we don't need to sync it
  const MEMBER_ACTIONS_EXCEPT_NONE = Object.values(MEMBER_ACTIONS).filter(
    action => action !== MEMBER_ACTIONS.NONE
  );
  return MEMBER_ACTIONS_EXCEPT_NONE.map(action => ({
    name: TASKS_NAMES.ScheduleMembersDataPerAction,
    data: { action },
  }));
};
const TASKS = {
  [TASKS_NAMES.ScheduleDailyMembersDataSync]: {
    name: TASKS_NAMES.ScheduleDailyMembersDataSync,
    scheduleChildrenSequentially: false,
    estimatedDurationSec: 60,
    childTasks: getDailyMembersDataSyncChildTasks(),
  },
  [TASKS_NAMES.ScheduleMembersDataPerAction]: {
    name: TASKS_NAMES.ScheduleMembersDataPerAction,
    getIdentifier: task => task.data.action,
    process: syncMembersDataPerAction,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 6,
  },
  [TASKS_NAMES.SyncMembers]: {
    name: TASKS_NAMES.SyncMembers,
    getIdentifier: task => task,
    process: synchronizeSinglePage,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 6,
  },
  [TASKS_NAMES.scheduleTaskForEmptyAboutYouMembers]: {
    name: TASKS_NAMES.scheduleTaskForEmptyAboutYouMembers,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleTaskForEmptyAboutYouMembers,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 40,
  },
  [TASKS_NAMES.convertHtmlToRichContent]: {
    name: TASKS_NAMES.convertHtmlToRichContent,
    getIdentifier: task => task.data.memberIds,
    process: convertAboutYouHtmlToRichContent,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 45,
  },
  [TASKS_NAMES.CompileFiltersOptions]: {
    name: TASKS_NAMES.CompileFiltersOptions,
    getIdentifier: task => task.data.field,
    process: compileFiltersOptions,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 6,
  },
  [TASKS_NAMES.scheduleTaskForExternalProfileImages]: {
    name: TASKS_NAMES.scheduleTaskForExternalProfileImages,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleTaskForExternalProfileImages,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 60,
  },
  [TASKS_NAMES.convertExternalProfilesToWixImages]: {
    name: TASKS_NAMES.convertExternalProfilesToWixImages,
    getIdentifier: task => task.data.memberIds,
    process: convertExternalProfilesToWixImages,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 55,
  },
  [TASKS_NAMES.updateSiteMapS3]: {
    name: TASKS_NAMES.updateSiteMapS3,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: updateSiteMapS3,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 70,
  },
  [TASKS_NAMES.scheduleContactFormEmailMigration]: {
    name: TASKS_NAMES.scheduleContactFormEmailMigration,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleContactFormEmailMigration,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 30,
  },
  [TASKS_NAMES.migrateContactFormEmails]: {
    name: TASKS_NAMES.migrateContactFormEmails,
    getIdentifier: task => task.data,
    process: migrateContactFormEmails,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 40,
  },
  [TASKS_NAMES.scheduleEmailSync]: {
    name: TASKS_NAMES.scheduleEmailSync,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleEmailSync,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 30,
  },
  [TASKS_NAMES.syncMemberLoginEmails]: {
    name: TASKS_NAMES.syncMemberLoginEmails,
    getIdentifier: task => task.data,
    process: syncMemberLoginEmails,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 45,
  },
};

module.exports = { TASKS };
