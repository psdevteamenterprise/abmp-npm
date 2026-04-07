module.exports = {
  ...require('./tasks-configs'),
  ...require('./consts'),
  ...require('./tasks-process-methods'),
  ...require('./migration-methods'),
  ...require('./url-migration-methods'),
  ...require('./address-primary-methods'),
  ...require('./url-space-fix-methods'),
  ...require('./daily-pull-backup-check-methods'),
};
