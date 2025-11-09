const { taskManager, TASK_TYPE } = require('psdev-task-manager');

const { COMPILED_FILTERS_FIELDS } = require('./consts');
const { TASKS_NAMES } = require('./tasks/consts');

const scheduleCompileFiltersTask = field =>
  taskManager().schedule({
    name: TASKS_NAMES.CompileFiltersOptions,
    data: { field },
    type: TASK_TYPE.SCHEDULED,
  });

function scheduleCompileInterestsTask() {
  return scheduleCompileFiltersTask(COMPILED_FILTERS_FIELDS.COMPILED_AREAS_OF_PRACTICES);
}

function scheduleCompileStatesTask() {
  return scheduleCompileFiltersTask(COMPILED_FILTERS_FIELDS.COMPILED_STATE_LIST);
}

function scheduleCompileCitiesTask() {
  return scheduleCompileFiltersTask(COMPILED_FILTERS_FIELDS.COMPILED_STATE_CITY_MAP);
}

module.exports = {
  scheduleCompileInterestsTask,
  scheduleCompileStatesTask,
  scheduleCompileCitiesTask,
};
