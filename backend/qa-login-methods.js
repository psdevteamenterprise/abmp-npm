const { authentication } = require('@wix/members');

const { getMemberByEmail, getQAUsers } = require('./members-data-methods');
const { getSecret } = require('./utils');

const validateQAUser = async userEmail => {
  const qaUsers = await getQAUsers();
  const matchingUser = qaUsers.find(user => user.email === userEmail);
  if (!matchingUser) {
    return { error: `Invalid user email: ${userEmail}` };
  }
  return { valid: true, user: matchingUser };
};

const loginQAMember = async (userEmail, secret) => {
  try {
    const userValidation = await validateQAUser(userEmail);
    if (userValidation.error) {
      return userValidation;
    }

    const qaSecret = await getSecret('ABMP_QA_SECRET');
    if (secret !== qaSecret) {
      return { error: 'Invalid secret' };
    }

    //TODO: this code still needs fixes, as there is no generateSessionToken method on
    const token = await authentication.generateSessionToken(userValidation.user, qaSecret);

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
      return userValidation;
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
