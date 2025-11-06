const { createLoginMethods } = require('./login-methods-factory');
const { validateMemberToken } = require('./sso-methods');

module.exports = {
  createLoginMethods,
  validateMemberToken,
};
