const geohash = require('ngeohash');

const { COLLECTIONS, MEMBERS_FIELDS } = require('../public/consts.js');
const { findMainAddress } = require('../public/Utils/sharedUtils.js');
const { calculateDistance, shuffleArray } = require('../public/Utils/sharedUtils.js');

const {
  getTodayInAssociationTimeZone,
  ASSOCIATION_EXPIRATION_FIELD,
} = require('./association-expiry');
const {
  CONFIG_KEYS,
  GEO_HASH_PRECISION,
  MAX__MEMBERS_SEARCH_RESULTS,
  WIX_QUERY_MAX_LIMIT,
  MEMBERSHIPS_TYPES,
} = require('./consts.js');
const { wixData } = require('./elevated-modules');
const { MEMBER_UPDATED_FIELD } = require('./listing-priority');
const { getSiteConfigs } = require('./utils');

// PAC asked for updated listings within 25 miles to rank first, and for the distance to be
// adjustable as more members fill their listings in - hence the site config rather than a constant.
const DEFAULT_PRIORITY_RADIUS_MILES = 25;

const LISTING_TIERS = {
  UPDATED: 'updated',
  REST: 'rest',
};

/**
 * Falls back to the default rather than throwing: a missing or malformed config value should
 * change the ordering, never break the directory.
 */
const getPriorityRadiusMiles = async () => {
  try {
    const configured = Number(await getSiteConfigs(CONFIG_KEYS.LISTING_PRIORITY_RADIUS_MILES));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_PRIORITY_RADIUS_MILES;
  } catch (error) {
    console.error('Could not read the listing priority radius, using the default', error);
    return DEFAULT_PRIORITY_RADIUS_MILES;
  }
};

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
  // Built fresh per call rather than derived from a shared base: the two tier queries must not
  // share any state.
  const buildQuery = tier => {
    let query = wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .ne('optOut', true)
      .ne('action', 'drop')
      .ne('memberships.membertype', MEMBERSHIPS_TYPES.PAC_STAFF)
      .eq('isVisible', true);

    query = query.ge(ASSOCIATION_EXPIRATION_FIELD, getTodayInAssociationTimeZone());
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
      query = query.ne('memberships.membertype', MEMBERSHIPS_TYPES.STUDENT);
    }
    if (tier === LISTING_TIERS.UPDATED) {
      query = query.eq(MEMBER_UPDATED_FIELD, true);
    } else if (tier === LISTING_TIERS.REST) {
      // Matches members whose flag was never written at all, the same way the optOut and action
      // gates above already rely on.
      query = query.ne(MEMBER_UPDATED_FIELD, true);
    }
    return query.ascending('firstName').fields(...Object.values(MEMBERS_FIELDS));
  };

  /**
   * Takes a random window of `limit` rows from a tier. The collection is never loaded in full -
   * the count tells us how far we may skip, exactly as the untiered search did.
   */
  const takeRandomWindow = async (query, totalCount, limit) => {
    if (limit <= 0 || totalCount === 0) return [];
    const maxSkip = Math.max(0, totalCount - limit);
    const skip = maxSkip > 0 ? Math.floor(Math.random() * (maxSkip + 1)) : 0;
    const result = await query.skip(skip).limit(limit).find({ omitTotalCount: true });
    return result.items;
  };

  /**
   * Typed search: updated listings first, then the rest, each shuffled within its own tier so the
   * tier boundary survives the randomisation. Two counts and two windows, run together, so this
   * costs the same round trips as the single untiered query it replaces.
   */
  const fetchTieredWindow = async () => {
    const updatedQuery = buildQuery(LISTING_TIERS.UPDATED);
    const restQuery = buildQuery(LISTING_TIERS.REST);

    const [updatedCount, restCount] = await Promise.all([updatedQuery.count(), restQuery.count()]);

    // Derived from the count rather than from the first window's length, so both windows can be
    // fetched in parallel.
    const updatedLimit = Math.min(updatedCount, MAX__MEMBERS_SEARCH_RESULTS);
    const [updatedItems, restItems] = await Promise.all([
      takeRandomWindow(updatedQuery, updatedCount, updatedLimit),
      takeRandomWindow(restQuery, restCount, MAX__MEMBERS_SEARCH_RESULTS - updatedLimit),
    ]);

    return {
      items: [...shuffleArray(updatedItems), ...shuffleArray(restItems)],
      totalCount: updatedCount + restCount,
    };
  };

  return {
    get: () => buildQuery(),
    run: async () => {
      const result = isSearchingNearby
        ? await fetchAllItemsInParallel(buildQuery())
        : await fetchTieredWindow();

      if (!isUserLocationEnabled) {
        return result;
      }

      const withDistances = result.items.map(item => ({
        ...item,
        distance: calculateDistance(
          {
            latitude: filter.latitude,
            longitude: filter.longitude,
          },
          findMainAddress(item.addressDisplayOption, item.addresses, {
            requireValidCoordinates: true,
          })
        ),
      }));

      if (!isSearchingNearby) {
        return { ...result, items: withDistances };
      }

      // "Near me": updated listings inside the radius first, shuffled among themselves, then
      // everything else nearest-first. Every row and its distance is already in memory here.
      const radiusMiles = await getPriorityRadiusMiles();
      const located = withDistances.filter(item => item.distance !== null);
      const isPrioritised = item =>
        item[MEMBER_UPDATED_FIELD] === true && item.distance <= radiusMiles;

      const prioritised = shuffleArray(located.filter(isPrioritised));
      const nearest = located
        .filter(item => !isPrioritised(item))
        .sort((a, b) => a.distance - b.distance);

      return {
        ...result,
        items: [...prioritised, ...nearest].slice(0, MAX__MEMBERS_SEARCH_RESULTS),
      };
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
