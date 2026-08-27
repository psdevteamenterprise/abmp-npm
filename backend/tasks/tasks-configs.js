const { MEMBER_ACTIONS } = require('../daily-pull/consts.js');
const {
  synchronizeSinglePage,
  syncMembersDataPerAction,
} = require('../daily-pull/sync-to-cms-methods');

const {
  scheduleFixPrimaryAddressForMembers,
  fixPrimaryAddressChunk,
} = require('./address-primary-methods');
const {
  scheduleSetAddressesToCityState,
  setAddressesToCityStateChunk,
} = require('./address-visibility-methods');
const {
  scheduleAssociationExpiryBackfill,
  associationExpiryBackfillChunk,
} = require('./association-expiry-backfill-methods');
const { TASKS_NAMES } = require('./consts');
const { dailyPullExecutionCheck } = require('./daily-pull-check-methods');
const {
  scheduleNormalizeMemberEmails,
  normalizeMemberEmailsChunk,
} = require('./email-normalize-methods');
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
  scheduleCreateContactsFromMembers,
  createContactsFromMembers,
} = require('./tasks-process-methods');
const {
  scheduleMigrateExistingUrls,
  migrateUrlsChunk,
  scheduleGenerateMissingUrls,
  generateUrlsChunk,
} = require('./url-migration-methods');
const { scheduleFixUrlsWithSpaces, fixUrlsWithSpacesChunk } = require('./url-space-fix-methods');

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
    getIdentifier: task => task.data,
    process: syncMembersDataPerAction,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 6,
  },
  [TASKS_NAMES.SyncMembers]: {
    name: TASKS_NAMES.SyncMembers,
    getIdentifier: task => task,
    process: synchronizeSinglePage,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 130, //Longer duration to ensure single page will be processed during job tick, for a smoother data updates, to reduce throttling and timeouts issues.
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
  [TASKS_NAMES.scheduleMigrateExistingUrls]: {
    name: TASKS_NAMES.scheduleMigrateExistingUrls,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleMigrateExistingUrls,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.migrateUrlsChunk]: {
    name: TASKS_NAMES.migrateUrlsChunk,
    getIdentifier: task => task.data,
    process: migrateUrlsChunk,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.scheduleGenerateMissingUrls]: {
    name: TASKS_NAMES.scheduleGenerateMissingUrls,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleGenerateMissingUrls,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.generateUrlsChunk]: {
    name: TASKS_NAMES.generateUrlsChunk,
    getIdentifier: task => task.data,
    process: generateUrlsChunk,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.scheduleCreateContactsFromMembers]: {
    name: TASKS_NAMES.scheduleCreateContactsFromMembers,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleCreateContactsFromMembers,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.createContactsFromMembers]: {
    name: TASKS_NAMES.createContactsFromMembers,
    getIdentifier: task => task.data,
    process: createContactsFromMembers,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.scheduleFixPrimaryAddressForMembers]: {
    name: TASKS_NAMES.scheduleFixPrimaryAddressForMembers,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleFixPrimaryAddressForMembers,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.fixPrimaryAddressChunk]: {
    name: TASKS_NAMES.fixPrimaryAddressChunk,
    getIdentifier: task => task.data,
    process: fixPrimaryAddressChunk,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.scheduleFixUrlsWithSpaces]: {
    name: TASKS_NAMES.scheduleFixUrlsWithSpaces,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleFixUrlsWithSpaces,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.fixUrlsWithSpacesChunk]: {
    name: TASKS_NAMES.fixUrlsWithSpacesChunk,
    getIdentifier: task => task.data,
    process: fixUrlsWithSpacesChunk,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.scheduleSetAddressesToCityState]: {
    name: TASKS_NAMES.scheduleSetAddressesToCityState,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleSetAddressesToCityState,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.setAddressesToCityStateChunk]: {
    name: TASKS_NAMES.setAddressesToCityStateChunk,
    getIdentifier: task => task.data,
    process: setAddressesToCityStateChunk,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.scheduleNormalizeMemberEmails]: {
    name: TASKS_NAMES.scheduleNormalizeMemberEmails,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleNormalizeMemberEmails,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.normalizeMemberEmailsChunk]: {
    name: TASKS_NAMES.normalizeMemberEmailsChunk,
    getIdentifier: task => task.data,
    process: normalizeMemberEmailsChunk,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.scheduleAssociationExpiryBackfill]: {
    name: TASKS_NAMES.scheduleAssociationExpiryBackfill,
    getIdentifier: () => 'SHOULD_NEVER_SKIP',
    process: scheduleAssociationExpiryBackfill,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 120,
  },
  [TASKS_NAMES.associationExpiryBackfillChunk]: {
    name: TASKS_NAMES.associationExpiryBackfillChunk,
    getIdentifier: task => task.data,
    process: associationExpiryBackfillChunk,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 80,
  },
  [TASKS_NAMES.dailyPullExecutionCheck]: {
    name: TASKS_NAMES.dailyPullExecutionCheck,
    getIdentifier: task => task.data,
    process: dailyPullExecutionCheck,
    shouldSkipCheck: () => false,
    estimatedDurationSec: 30,
  },
};

module.exports = { TASKS };
