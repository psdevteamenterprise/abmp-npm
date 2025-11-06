const { getMemberByEmail, getQAUsers } = require('../members-data-methods');
const { getSecret } = require('../utils');

const validateQAUser = async userEmail => {
  const qaUsers = await getQAUsers();
  const matchingUser = qaUsers.find(user => user.email === userEmail);
  if (!matchingUser) {
    return { error: `Invalid user email: ${userEmail}` };
  }
  return { valid: true, user: matchingUser };
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
    const userValidation = await validateQAUser(userEmail);
    if (userValidation.error) {
      return { success: false, error: userValidation.error };
    }

    const qaSecret = await getSecret('ABMP_QA_SECRET');
    if (secret !== qaSecret) {
      console.log('Invalid secret', secret, qaSecret);
      return { success: false, error: 'Invalid secret' };
    }

    const token = await generateSessionToken(userValidation.user, qaSecret);

    const result = await getMemberCMSId(userEmail);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      token,
      memberCMSId: result.memberCMSId,
    };
  } catch (error) {
    console.error('QA login error:', error);
    return { error: 'Failed to generate session token' };
  }
};

async function getMemberCMSId(userEmail) {
  try {
    const userValidation = await validateQAUser(userEmail);
    if (userValidation.error) {
      return { success: false, error: userValidation.error };
    }

    const member = await getMemberByEmail(userEmail);

    if (!member) {
      return { success: false, error: `No Member found in DB matching email: ${userEmail}` };
    }
    return { success: true, memberCMSId: member._id };
  } catch (error) {
    console.error('Error getting member CMS ID:', error);
    return { success: false, error: 'Failed to retrieve member data' };
  }
}

module.exports = {
  loginQAMember,
};
