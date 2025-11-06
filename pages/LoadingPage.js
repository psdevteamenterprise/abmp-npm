const { window: wixWindow, rendering } = require('@wix/site-window');

const { LIGHTBOX_NAMES } = require('../public/consts');
const { checkAndLogin } = require('../public/sso-auth-methods');

async function loadingPageOnReady(authenticateSSOToken) {
  const renderingEnv = await rendering.env();
  //This calls needs to triggered on client side, otherwise PAC API will return 401 error
  if (renderingEnv === 'browser') {
    //Need to pass authenticateSSOToken to checkAndLogin so it will run as a web method not a public one.
    await checkAndLogin(authenticateSSOToken).catch(error => {
      wixWindow.openLightbox(LIGHTBOX_NAMES.LOGIN_ERROR_ALERT);
      console.error(`Something went wrong while logging in: ${error}`);
    });
  }
}

module.exports = {
  loadingPageOnReady,
};
