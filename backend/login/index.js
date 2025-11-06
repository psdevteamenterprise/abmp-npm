const { loginQAMember } = require('./qa-login-methods');
const { authenticateSSOToken, validateMemberToken } = require('./sso-methods');

const createLoginMethods = generateSessionToken => {
  //There is no generateSessionToken SDK version,  and the signOn of @wix/identity returns 403 error regardless that the permissions are valid
  //Therefore, as a workaround we need to inject the Velo version of generateSessionToken to the login methods.
  const injectGenerateSessionTokenToMethod =
    method =>
    async (...args) =>
      await method(...args, generateSessionToken);
  return {
    loginQAMember: injectGenerateSessionTokenToMethod(loginQAMember),
    authenticateSSOToken: injectGenerateSessionTokenToMethod(authenticateSSOToken),
  };
};

module.exports = {
  createLoginMethods,
  validateMemberToken,
};
