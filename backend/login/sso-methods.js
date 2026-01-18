const { createHmac } = require('crypto');

const { decode } = require('jwt-js-decode');

const { CONFIG_KEYS, SSO_TOKEN_AUTH_API_URL } = require('../consts');
const { MEMBER_ACTIONS } = require('../daily-pull/consts');
const { getCurrentMember } = require('../members-area-methods');
const { getCMSMemberByWixMemberId, prepareMemberForSSOLogin } = require('../members-data-methods');
const {
  formatDateToMonthYear,
  getAddressDisplayOptions,
  isStudent,
  getSiteConfigs,
  getSecret,
} = require('../utils');

/**
 * Validates member token and retrieves member data
 * @param {string} memberIdInput - The member ID to validate
 * @returns {Promise<{memberData: Object|null, isValid: boolean}>} Validation result with member data
 */
async function validateMemberToken(memberIdInput) {
  const invalidTokenResponse = { memberData: null, isValid: false };

  if (!memberIdInput) {
    return invalidTokenResponse;
  }

  try {
    const member = await getCurrentMember();
    if (!member || !member._id) {
      console.log(
        'member not found from members.getCurrentMember() for memberIdInput',
        memberIdInput
      );
      return invalidTokenResponse;
    }

    const [dbMember, siteConfigs] = await Promise.all([
      getCMSMemberByWixMemberId(member._id),
      getSiteConfigs(),
    ]);
    const siteAssociation = siteConfigs[CONFIG_KEYS.SITE_ASSOCIATION];
    const membersExternalPortalUrl = siteConfigs[CONFIG_KEYS.MEMBERS_EXTERNAL_PORTAL_URL];
    console.log('dbMember by wix member id is:', dbMember);
    console.log('member._id', member._id);

    if (!dbMember?._id) {
      const errorMessage = `No record found in DB for logged in Member [Corrupted Data - Duplicate Members? ] - There is no match in DB for currentMember: ${JSON.stringify(
        { memberIdInput, currentMemberId: member._id }
      )}`;
      console.error(errorMessage);
      throw new Error('CORRUPTED_MEMBER_DATA');
    }

    console.log(`Id found in DB for memberIdInput :${memberIdInput} is ${dbMember?._id}`);

    const memberData = dbMember;

    // Format membership dates
    memberData.memberships = memberData.memberships.map(membership => ({
      ...membership,
      membersince: formatDateToMonthYear(membership.membersince),
      isSiteAssociation: membership.association === siteAssociation,
    }));

    const savedMemberId = memberData?._id;
    const isValid = savedMemberId === memberIdInput;

    if (!savedMemberId || !isValid) {
      return invalidTokenResponse;
    }

    // Check if member is dropped
    if (memberData.action === MEMBER_ACTIONS.DROP) {
      return invalidTokenResponse;
    }

    // Add computed properties
    memberData.addressDisplayOption = getAddressDisplayOptions(memberData);
    console.log('memberData', memberData);
    memberData.isStudent = isStudent(memberData);

    return { memberData, isValid, membersExternalPortalUrl };
  } catch (error) {
    console.error('Error in validateMemberToken:', error);
    throw error;
  }
}
async function checkAndFetchSSO(token) {
  const SSO_TOKEN_AUTH_API_KEY = await getSecret('SSO_TOKEN_AUTH_API_KEY');
  const signature = createHmac('sha256', SSO_TOKEN_AUTH_API_KEY).update(token).digest('hex');
  const professionalassistcorpUrl = `${SSO_TOKEN_AUTH_API_URL}/eweb/SSOToken.ashx?token=${token}&Partner=Wix&Signature=${signature}`;
  const options = {
    method: 'get',
  };
  try {
    const httpResponse = await fetch(professionalassistcorpUrl, options);
    console.log('httpResponse status', httpResponse.status);
    if (!httpResponse.ok) {
      throw new Error('Fetch did not succeed with status: ' + httpResponse.status);
    }
    const responseToken = await httpResponse.text();
    return responseToken;
  } catch (error) {
    console.error('Error in checkAndFetchSSO', error);
    return null;
  }
}

/**
 * Authenticate an SSO token
 * @param {Object} params - The parameters for the authentication
 * @param {string} params.token - The token to authenticate
 * @param {Function} generateSessionToken - a dependency of the method, injected by the createLoginMethods function
 * @returns {Promise<Object>} The result of the authentication
 */
const authenticateSSOToken = async ({ token }, generateSessionToken) => {
  const responseToken = await checkAndFetchSSO(token);
  const isValidToken = Boolean(
    responseToken && typeof responseToken === 'string' && responseToken?.trim()
  );
  const toLogTokenData = {
    isValidToken,
    tokenData: responseToken
      ? {
          length: responseToken.length,
          preview: responseToken.substring(0, 50),
        }
      : 'No token',
  };
  console.log('checkAndFetchSSO responseToken data', JSON.stringify(toLogTokenData, null, 2));
  if (isValidToken) {
    const jwt = decode(responseToken);
    const payload = jwt.payload;
    const membersData = await prepareMemberForSSOLogin(payload);
    console.log('membersDataCollectionId', membersData._id);
    const sessionToken = await generateSessionToken(membersData.email);
    const authObj = {
      type: 'success',
      memberId: membersData._id,
      sessionToken,
    };
    return authObj;
  } else {
    console.log('invalid Token responseToken is: ', responseToken);
    return {
      type: 'error',
      memberId: '',
      sessionToken: '',
    };
  }
};

module.exports = {
  validateMemberToken,
  authenticateSSOToken,
};
