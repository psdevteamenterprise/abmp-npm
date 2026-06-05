const { CONFIG_KEYS } = require('../consts');
const { prepareMemberForQALogin, getQAUsers } = require('../members-data-methods');
const { getSecret, getSiteConfigs } = require('../utils');

const { generateMemberSessionToken } = require('./generate-member-session-token');

const validateQAUser = async userEmail => {
  const qaUsers = await getQAUsers();
  const matchingUserEmail = qaUsers.find(user => user.email === userEmail)?.email;
  if (!matchingUserEmail) {
    return { error: `Invalid user email: ${userEmail}` };
  }
  return { valid: true, email: matchingUserEmail };
};

/**
 * Login a QA user
 * @param {Object} params - The parameters for the login
 * @param {string} params.userEmail - The email of the user to login
 * @param {string} params.secret - The secret of the user to login
 * @returns {Promise<Object>} The result of the login
 */
const loginQAMember = async ({ userEmail, secret }) => {
  try {
    const [qaSecret, allowAnyMember] = await Promise.all([
      getSecret('ABMP_QA_SECRET'),
      getSiteConfigs(CONFIG_KEYS.QA_ALLOW_ANY_MEMBER),
    ]);
    if (secret !== qaSecret) {
      return { success: false, error: 'Invalid secret' };
    }
    if (!allowAnyMember) {
      const userValidation = await validateQAUser(userEmail);
      if (userValidation.error) {
        return { success: false, error: userValidation.error };
      }
    }

    const memberData = await prepareMemberForQALogin(userEmail);
    const token = await generateMemberSessionToken(memberData.email);
    return {
      success: true,
      token,
      memberCMSId: memberData._id,
    };
  } catch (error) {
    console.error('QA login error:', error);
    return { error: 'Failed to generate session token' };
  }
};

module.exports = {
  loginQAMember,
};
