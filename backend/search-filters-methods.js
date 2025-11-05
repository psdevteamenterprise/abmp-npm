const { COLLECTIONS } = require('../public/consts');

const { buildMembersSearchQuery } = require('./cms-data-methods');
const { wixData } = require('./elevated-modules');
const { retrieveAllItems } = require('./utils');

const getCompiledFiltersOptions = () =>
  wixData.get(COLLECTIONS.COMPILED_STATE_CITY_MAP, 'SINGLE_ITEM_ID');

const getNonCompiledFiltersOptions = async () => {
  const [completeStateList, areasOfPracticesList, stateCityMapList] = await Promise.all([
    getCompleteStateList(),
    getAreasOfPracticeList(),
    getStateCityMap(),
  ]);
  return { completeStateList, areasOfPracticesList, stateCityMapList };
};
const filterProfiles = async data => {
  const membersSearchQuery = buildMembersSearchQuery({ ...data, includeStudents: false });
  const query = await membersSearchQuery.get();
  return membersSearchQuery.run(query);
};

async function getAreasOfPracticeList() {
  const interestsData = await retrieveAllItems(COLLECTIONS.INTERESTS);
  return interestsData.map(({ title }) => ({ label: title, value: title }));
}

async function getStateCityMap() {
  const getAllCitiesMap = async () => {
    const totalCount = await wixData.query(COLLECTIONS.STATE_CITY_MAP).count();
    const baseQuery = wixData.query(COLLECTIONS.STATE_CITY_MAP).limit(1000);
    const batchedQueries = Array.from({ length: Math.ceil(totalCount / 1000) }, (_, i) =>
      baseQuery.skip(i * 1000)
    );
    const allCities = await Promise.all(
      batchedQueries.map(query => query.find({ omitTotalCount: true }).then(res => res.items))
    );
    return allCities.flat();
  };
  const allCities = await getAllCitiesMap();
  const stateCityMap = new Map();
  allCities.forEach(cityObj => {
    const state = cityObj.stateText;
    const city = cityObj.title;
    const cityArray = stateCityMap.has(state) ? [...stateCityMap.get(state), city] : [city];
    stateCityMap.set(state, cityArray);
  });
  return Object.fromEntries(stateCityMap);
}
//Besan comments on moved code: Below code assumes that Velo can cache value, however this isn't valid so it needs adjustment
// Cache for state list
let stateListCache = null;
let lastCacheTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

async function getCompleteStateList() {
  // Check if we have a valid cache
  const now = Date.now();
  if (stateListCache && now - lastCacheTime < CACHE_DURATION) {
    return stateListCache;
  }

  // 1. fire both queries at once:
  const [stateRecords, memberStates] = await Promise.all([
    retrieveAllItems(COLLECTIONS.STATE),
    getMembersStateList(), //this method a
  ]);

  const fullNameByCode = new Map(stateRecords.map(st => [st.title, st.name]));

  const states = memberStates.map(({ value: code }) => ({
    value: code,
    label: fullNameByCode.get(code) || code,
  }));

  // Update cache
  stateListCache = states;
  lastCacheTime = now;

  return states;
}
//Besan Comments on moved code: THIS WILL IGNORE SOME STATES VALUES while we should return all states AFAIU
async function getMembersStateList() {
  try {
    // Use a more efficient query to get only the addresses field
    const results = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .fields('addresses')
      .limit(1000)
      .find();

    // Extract all state codes from addresses
    const allStates = new Set();
    results.items.forEach(member => {
      if (Array.isArray(member.addresses)) {
        member.addresses.forEach(addr => {
          if (addr.state) allStates.add(addr.state);
        });
      }
    });

    // Convert to array and sort
    const uniqueStates = Array.from(allStates).sort();

    // Map to label/value format
    return uniqueStates.map(stateCode => ({
      label: stateCode,
      value: stateCode,
    }));
  } catch (error) {
    console.error('Error in getMembersStateList:', error);
    return [];
  }
}

module.exports = {
  getCompiledFiltersOptions,
  getNonCompiledFiltersOptions,
  filterProfiles,
  getCompleteStateList,
  getAreasOfPracticeList,
  getStateCityMap,
};
