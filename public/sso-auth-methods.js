const { location: wixLocationFrontend } = require('@wix/site-location');
const { authentication } = require('@wix/site-members');
const { local } = require('@wix/site-storage');

const { PAGES_PATHS } = require('./consts');

const checkAndLogin = async authenticateSSOToken => {
  const query = await wixLocationFrontend.query();
  const token = query['token']?.trim();
  try {
    if (token) {
      const authObj = await authenticateSSOToken({ token });
      console.log('authObj', authObj);
      if (authObj.type == 'success') {
        console.log('success');
        await Promise.all([
          authentication.applySessionToken(authObj?.sessionToken),
          local.setItem('memberId', authObj.memberId),
        ]);
        console.log('memberId', authObj.memberId);
        const queryParams = {
          ...query,
          token: authObj?.memberId,
        };
        const redirectTo = `${PAGES_PATHS.MEMBERS_FORM}?${new URLSearchParams(queryParams).toString()}`;
        await wixLocationFrontend.to(`/${redirectTo}`);
      } else {
        console.error('Something went wrong while logging in');
        throw new Error('Authentication failed - invalid response from server');
      }
    } else {
      console.log('checkAndLogin: No token found');
      throw new Error('No authentication token found in URL');
    }
  } catch (error) {
    console.error('Error in checkAndLogin', error);
    throw error;
  }
};

module.exports = {
  checkAndLogin,
};
