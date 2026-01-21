const { PAC_API_URL, BACKUP_API_URL, CONFIG_KEYS } = require('./consts');
const { getSecret, getSiteConfigs } = require('./utils');

const getPacApiBaseUrl = async backupDate => {
  if (backupDate) {
    return BACKUP_API_URL;
  }
  const overrideUrl = await getSiteConfigs(CONFIG_KEYS.PAC_API_URL_OVERRIDE);
  if (typeof overrideUrl === 'string' && overrideUrl.trim()) {
    return overrideUrl.trim();
  }
  return PAC_API_URL;
};

const getHeaders = async () => {
  const AUTH_TOKEN = await getSecret('members-data-api-key');
  const headers = {
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };
  return headers;
};
/**
 *
 * @param {*} params
 * @param {number} params.page - The page number to fetch
 * @param {string} params.action - The action to fetch
 * @param {string} [params.backupDate] - Optional. The backup date to fetch in format YYYY-MM-DD, use only to fetch from backup endpoint not from PAC endpoint.
 * @returns {Promise<Object>} - The response from the API
 */
const fetchPACMembers = async ({ page, action, backupDate }) => {
  const baseUrl = await getPacApiBaseUrl(backupDate);
  const queryParams = { page, actionFilter: action };
  if (backupDate) {
    queryParams.date = backupDate;
  }
  const url = `${baseUrl}/Members?${new URLSearchParams(queryParams).toString()}`;
  console.log(`Fetching PAC members from:  ${url}`);
  const headers = await getHeaders();
  const fetchOptions = {
    method: 'get',
    headers: headers,
  };
  const response = await fetch(url, fetchOptions);
  const responseType = response.headers.get('content-type');
  if (!responseType.includes('application/json')) {
    const errorMessage = `[fetchPACMembers] got invalid responseType: ${responseType} for page ${page} and actionFilter ${action}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  if (response.ok) {
    return response.json();
  } else {
    const errorMessage = `[fetchPACMembers] failed with status ${response.status} for page ${page} and actionFilter ${action}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};

module.exports = { fetchPACMembers, getHeaders }; //TODO: remove getHeaders from exported methods once npm movement finishes
