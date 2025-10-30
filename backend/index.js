module.exports = {
  ...require('./forms-methods'),
  ...require('./search-filters-methods'),
  ...require('./jobs'),
  ...require('./utils'), //TODO: remove it once we finish NPM movement
  ...require('./daily-pull'), //TODO: remove it once we finish NPM movement
  ...require('./pac-api-methods'), //TODO: remove it once we finish NPM movement
  ...require('./members-area-methods'), //TODO: remove it once we finish NPM movement
  ...require('./members-data-methods'), //TODO: remove it once we finish NPM movement
};
