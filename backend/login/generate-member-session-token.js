const { auth } = require('@wix/essentials');
const { authentication } = require('@wix/identity');

const elevatedSignOn = auth.elevate(authentication.signOn);

/**
 * Creates a Wix member session token for SSO / QA login using @wix/identity signOn (elevated).
 * @param {string} email - Member login email
 * @returns {Promise<string>} Session token for authentication.applySessionToken on the client
 */
async function generateMemberSessionToken(email) {
  const trimmedEmail = (email || '').trim();
  if (!trimmedEmail) {
    throw new Error('Email is required to generate a session token');
  }

  const response = await elevatedSignOn({ email: trimmedEmail });
  const sessionToken = response?.sessionToken;
  if (!sessionToken) {
    throw new Error('Failed to generate session token: empty response from signOn');
  }
  return sessionToken;
}

module.exports = {
  generateMemberSessionToken,
};
