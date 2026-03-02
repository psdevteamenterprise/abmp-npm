const { location: wixLocationFrontend } = require('@wix/site-location');
const { local } = require('@wix/site-storage');
const { window: wixWindow, rendering } = require('@wix/site-window');

const { LIGHTBOX_NAMES, PAGES_PATHS } = require('../public/consts');
const { checkAndLogin } = require('../public/sso-auth-methods');

async function loadingPageOnReady(authenticateSSOToken) {
  const renderingEnv = await rendering.env();
  //This calls needs to triggered on client side, otherwise PAC API will return 401 error
  if (renderingEnv === 'browser') {
    //Need to pass authenticateSSOToken to checkAndLogin so it will run as a web method not a public one.
    await checkAndLogin(authenticateSSOToken).catch(async error => {
      console.error(`Something went wrong while logging in: ${error}`);
      // If we already have a session (memberId), redirect to form instead of showing error.
      const storedMemberId = await local.getItem('memberId');
      if (storedMemberId) {
        const redirectTo = `${PAGES_PATHS.MEMBERS_FORM}?token=${encodeURIComponent(storedMemberId)}`;
        await wixLocationFrontend.to(`/${redirectTo}`);
        return;
      }
      wixWindow.openLightbox(LIGHTBOX_NAMES.LOGIN_ERROR_ALERT);
    });
  }
}

module.exports = {
  loadingPageOnReady,
};
