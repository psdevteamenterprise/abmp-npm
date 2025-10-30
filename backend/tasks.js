const { TASKS_NAMES } = require('./consts');
const { MEMBER_ACTIONS, synchronizeSinglePage, syncMembersDataPerAction } = require('./daily-pull');

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
};

module.exports = { TASKS };
