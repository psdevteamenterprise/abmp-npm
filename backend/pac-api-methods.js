const { secrets } = require('@wix/secrets');

const { PAC_API_URL } = require('./consts');

const getHeaders = async () => {
  const AUTH_TOKEN = await secrets.getSecretValue('members-data-api-key');
  const headers = {
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };
  return headers;
};
const fetchPACMembers = async (pageNum, actionFilter) => {
  const url = `${PAC_API_URL}/Members?page=${pageNum}&actionFilter=${actionFilter}`;
  const headers = await getHeaders();
  const fetchOptions = {
    method: 'get',
    headers: headers,
  };
  const response = await fetch(url, fetchOptions);
  const responseType = response.headers.get('content-type');
  if (!responseType.includes('application/json')) {
    const errorMessage = `[fetchPACMembers] got invalid responseType: ${responseType} for page ${pageNum} and actionFilter ${actionFilter}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  if (response.ok) {
    return response.json();
  } else {
    const errorMessage = `[fetchPACMembers] failed with status ${response.status} for page ${pageNum} and actionFilter ${actionFilter}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};

module.exports = { fetchPACMembers, getHeaders }; //TODO: remove getHeaders from exported methods once npm movement finishes
