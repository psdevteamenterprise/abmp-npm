const { PAC_API_URL, BACKUP_API_URL } = require('./consts');
const { getSecret } = require('./utils');

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
  const baseUrl = backupDate ? BACKUP_API_URL : PAC_API_URL;
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
