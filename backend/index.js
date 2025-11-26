module.exports = {
  ...require('./forms-methods'),
  ...require('./search-filters-methods'),
  ...require('./jobs'),
  ...require('./consts'), //TODO: remove it once we finish NPM movement
  ...require('./utils'), //TODO: remove it once we finish NPM movement
  ...require('./daily-pull'), //TODO: remove it once we finish NPM movement
  ...require('./pac-api-methods'), //TODO: remove it once we finish NPM movement
  ...require('./members-area-methods'), //TODO: remove it once we finish NPM movement
  ...require('./members-data-methods'), //TODO: remove it once we finish NPM movement
  ...require('./cms-data-methods'), //TODO: remove it once we finish NPM movement
  ...require('./routers'),
  ...require('./login'),
  ...require('./data-hooks'),
  ...require('./http-functions'),
  ...require('./dev-only-methods'),
};
