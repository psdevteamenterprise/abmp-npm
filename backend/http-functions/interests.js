const axios = require('axios');

const { COLLECTIONS } = require('../../public/consts');
const { clearCollection } = require('../cms-data-methods');
const { CONFIG_KEYS } = require('../consts');
const { wixData } = require('../elevated-modules');
const { getHeaders } = require('../pac-api-methods');
const { getSiteConfigs } = require('../utils');

const getInterests = async () => {
  const [url, headers] = await Promise.all([
    getSiteConfigs(CONFIG_KEYS.INTERESTS_API_URL),
    getHeaders(),
  ]);
  try {
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (e) {
    console.error('Error getting interests:', e);
    throw e;
  }
};

async function migrateInterests() {
  const [interests, _] = await Promise.all([
    getInterests(),
    clearCollection(COLLECTIONS.INTERESTS),
  ]);
  const interestData = interests.map(val => ({ title: val.interest }));
  return await wixData.bulkInsert(COLLECTIONS.INTERESTS, interestData);
}

module.exports = {
  migrateInterests,
};
