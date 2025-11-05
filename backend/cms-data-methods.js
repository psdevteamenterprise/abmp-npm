const geohash = require('ngeohash');

const { COLLECTIONS, MEMBERS_FIELDS } = require('../public/consts.js');
const { findMainAddress } = require('../public/Utils/sharedUtils.js');
const { calculateDistance, shuffleArray } = require('../public/Utils/sharedUtils.js');

const {
  GEO_HASH_PRECISION,
  MAX__MEMBERS_SEARCH_RESULTS,
  WIX_QUERY_MAX_LIMIT,
} = require('./consts.js');
const { wixData } = require('./elevated-modules');

function buildMembersSearchQuery(data) {
  console.log('data: ', JSON.stringify(data));
  const { filter, isSearchingNearby, includeStudents = false } = data;
  const isUserLocationEnabled = filter.latitude !== 0 || filter.longitude !== 0;
  filter.searchText = filter.searchText || '';
  filter.stateSearch = filter.stateSearch || '';
  filter.practiceAreasSearch = filter.practiceAreasSearch || '';
  filter.practiceAreas = filter.practiceAreas || [];
  filter.state = filter.state || [];
  filter.citySearch = filter.citySearch || '';
  filter.city = filter.city || [];
  filter.latitude = filter.latitude || 0;
  filter.longitude = filter.longitude || 0;
  filter.postalcode = filter.postalcode || '';
  return {
    get: () => {
      let query = wixData
        .query(COLLECTIONS.MEMBERS_DATA)
        .ne('optOut', true)
        .ne('action', 'drop')
        .eq('isVisible', true);
      let filterConfig = [
        {
          filterKey: 'practiceAreas',
          queryMethod: 'hasSome',
          queryField: 'areasOfPractices',
          condition: value => value && value.length > 0,
          fallback: {
            filterKey: 'practiceAreasSearch',
            queryMethod: 'contains',
            queryField: 'areasOfPractices',
            condition: value => value && value.trim() !== '',
          },
        },
        {
          filterKey: 'postalcode',
          queryMethod: 'contains',
          queryField: 'addresses.postalcode',
          condition: value => value && value.trim() !== '',
        },
        {
          filterKey: 'state',
          queryMethod: 'hasSome',
          queryField: 'addresses.state',
          condition: value => value && value.length > 0,
          fallback: {
            filterKey: 'stateSearch',
            queryMethod: 'contains',
            queryField: 'addresses.state',
            condition: value => value && value.trim() !== '',
          },
        },
        {
          filterKey: 'city',
          queryMethod: 'hasSome',
          queryField: 'addresses.city',
          condition: value => value && value.length > 0,
          fallback: {
            filterKey: 'citySearch',
            queryMethod: 'contains',
            queryField: 'addresses.city',
            condition: value => value && value.trim() !== '',
          },
        },
      ];
      //Ignore state, city and postal code when isSearchingNearby is true
      if (isSearchingNearby) {
        filterConfig = filterConfig.filter(
          config => !['state', 'city', 'postalcode'].includes(config.filterKey)
        );
      }
      const applyFilterToQuery = (query, config, filter) => {
        const filterValue = filter[config.filterKey];
        if (config.condition(filterValue)) {
          return query[config.queryMethod](config.queryField, filterValue);
        } else if (config.fallback) {
          return applyFilterToQuery(query, config.fallback, filter);
        }
        return query;
      };
      // Apply filters using the configuration
      filterConfig.forEach(config => {
        query = applyFilterToQuery(query, config, filter);
      });
      if (isUserLocationEnabled && isSearchingNearby) {
        const userGeohash = geohash.encode(filter.latitude, filter.longitude, GEO_HASH_PRECISION);
        const neighborGeohashes = geohash.neighbors(userGeohash);
        const geohashList = [userGeohash, ...neighborGeohashes];
        query = query.hasSome('locHash', geohashList);
      }
      if (filter.searchText.trim() !== '') {
        query = query.contains('fullName', filter.searchText);
      }
      if (!includeStudents) {
        query = query.ne('memberships.membertype', 'Student');
      }
      return query;
    },
    run: async query => {
      const baseQuery = query.ascending('firstName').fields(...Object.values(MEMBERS_FIELDS));
      const getRandomSkip = totalCount => {
        let randomSkip = 0;
        if (totalCount > MAX__MEMBERS_SEARCH_RESULTS) {
          const maxSkip = totalCount - MAX__MEMBERS_SEARCH_RESULTS;
          randomSkip = Math.floor(Math.random() * (maxSkip + 1));
        }
        return randomSkip;
      };
      const getResult = async query => {
        if (isSearchingNearby) {
          return fetchAllItemsInParallel(baseQuery);
        }
        const totalCount = await query.count();
        const randomSkip = getRandomSkip(totalCount);
        const result = await query
          .skip(randomSkip)
          .limit(MAX__MEMBERS_SEARCH_RESULTS)
          .find({ omitTotalCount: true });

        // Shuffle the result items for additional randomization
        return {
          ...result,
          items: shuffleArray(result.items),
        };
      };

      const result = await getResult(baseQuery);
      if (isUserLocationEnabled) {
        const withDistances = result.items.map(item => ({
          ...item,
          distance: calculateDistance(
            {
              latitude: filter.latitude,
              longitude: filter.longitude,
            },
            findMainAddress(item.addressDisplayOption, item.addresses)
          ),
        }));
        const resultWithDistances = {
          ...result,
          items: withDistances,
        };
        if (isSearchingNearby) {
          return {
            ...resultWithDistances,
            items: withDistances
              .filter(item => item.distance !== null)
              .sort((a, b) => a.distance - b.distance)
              .slice(0, MAX__MEMBERS_SEARCH_RESULTS),
          };
        }
        return resultWithDistances;
      }
      return result;
    },
  };
}

// Generic parallel fetch function for large datasets
async function fetchAllItemsInParallel(query) {
  const batchSize = WIX_QUERY_MAX_LIMIT;
  const allItems = [];

  const firstResult = await query.skip(0).limit(batchSize).find();

  const totalBatches = firstResult.totalPages;
  allItems.push(...firstResult.items);

  if (totalBatches > 1) {
    // Create parallel promises for all remaining batches
    const batchPromises = [];
    for (let i = 1; i < totalBatches; i++) {
      const skip = i * batchSize;
      const promise = query
        .skip(skip)
        .limit(batchSize)
        .find()
        .then(result => result.items);
      batchPromises.push(promise);
    }

    // Execute all batches in parallel
    const batchResults = await Promise.all(batchPromises);
    for (const items of batchResults) {
      if (items.length > 0) {
        allItems.push(...items);
      }
    }
  }

  return {
    ...firstResult,
    items: allItems,
  };
}

/**
 * Get all interests from the database
 * @returns {Promise<Array<string>>} Array of interest titles sorted alphabetically
 */
async function getInterestAll() {
  try {
    let res = await wixData.query(COLLECTIONS.INTERESTS).limit(1000).find();

    let interests = res.items.map(x => x.title);

    while (res.hasNext()) {
      res = await res.next();
      interests.push(...res.items.map(x => x.title));
    }

    // Sort the interests alphabetically (case-insensitive)
    interests = interests.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    return interests;
  } catch (e) {
    console.error('Error in getInterestAll:', e);
    throw e;
  }
}
async function clearCollection(collectionName) {
  try {
    await wixData.truncate(collectionName);
  } catch (err) {
    throw new Error(`Failed to clearCollection ${collectionName} with error: ${err.message}`);
  }
}

module.exports = {
  buildMembersSearchQuery,
  fetchAllItemsInParallel,
  getInterestAll,
  clearCollection,
};
