const { loginQAMember } = require('./qa-login-methods');
const { validateMemberToken, authenticateSSOToken } = require('./sso-methods');

module.exports = {
  loginQAMember,
  validateMemberToken,
  authenticateSSOToken,
};
