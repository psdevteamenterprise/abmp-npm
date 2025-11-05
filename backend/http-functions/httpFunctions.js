const { COLLECTIONS } = require('../../public/consts');
const { clearCollection } = require('../cms-data-methods');
const { getSecret } = require('../utils');

const { migrateInterests } = require('./interests');

const createHTTPFunctionsHelpers = wixHTTPFunctionsMethods => {
  const { created, serverError, forbidden, ok, badRequest } = wixHTTPFunctionsMethods;
  const responseOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const isRequestAuthenticated = async request => {
    const AUTH_TOKEN = await getSecret('migrate-api-key');
    return request.headers.authorization === 'Bearer ' + AUTH_TOKEN;
  };

  const withAuth = handler => async request => {
    if (!(await isRequestAuthenticated(request))) {
      return forbidden({
        ...responseOptions,
        body: { error: 'Unauthorized' },
      });
    }
    return handler(request);
  };

  const migrateInterestsHandler = async _request => {
    try {
      const result = await migrateInterests();
      return created({
        ...responseOptions,
        body: {
          result,
        },
      });
    } catch (error) {
      console.error('Error migrating interests:', error);
      return serverError(error);
    }
  };

  const clearCollectionHandler = async request => {
    try {
      const collectionName = request.query.collectionName;
      if (!collectionName || !Object.values(COLLECTIONS).includes(collectionName)) {
        return badRequest({
          ...responseOptions,
          body: { error: 'Invalid collection name' },
        });
      }
      const result = await clearCollection(collectionName);
      return ok({
        ...responseOptions,
        body: {
          result,
        },
      });
    } catch (error) {
      return serverError(error);
    }
  };

  return {
    post_migrateInterests: withAuth(migrateInterestsHandler),
    delete_clearCollection: withAuth(clearCollectionHandler),
  };
};

module.exports = { createHTTPFunctionsHelpers };
