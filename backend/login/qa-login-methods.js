const { prepareMemberForQALogin, getQAUsers } = require('../members-data-methods');
const { getSecret } = require('../utils');

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
 * @param {Function} generateSessionToken - a dependency of the method, injected by the createLoginMethods function
 * @returns {Promise<Object>} The result of the login
 */
const loginQAMember = async ({ userEmail, secret }, generateSessionToken) => {
  try {
    const [userValidation, qaSecret] = await Promise.all([
      validateQAUser(userEmail),
      getSecret('ABMP_QA_SECRET'),
    ]);
    if (userValidation.error) {
      return { success: false, error: userValidation.error };
    }
    if (secret !== qaSecret) {
      return { success: false, error: 'Invalid secret' };
    }

    const memberData = await prepareMemberForQALogin(userValidation.email);
    const token = await generateSessionToken(memberData.email, qaSecret);
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
