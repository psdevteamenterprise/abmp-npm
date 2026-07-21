const { location: wixLocation } = require('@wix/site-location');
const { lightbox } = require('@wix/site-window');

const { PAGES_PATHS } = require('../public/consts.js');

/**
 * Shown from the directory when a member's primary address is not a full address,
 * so "Directions" cannot be offered. Sends the visitor to the member's profile
 * page rather than opening the contact form.
 */
async function contactForLocationOnReady({ $w: _$w }) {
  const member = await lightbox.getContext();
  const profilePath = member?.url;

  if (!profilePath) {
    _$w('#contact').hide();
    return;
  }

  _$w('#contact').onClick(async () => {
    await lightbox.close();
    wixLocation.to(`/${PAGES_PATHS.PROFILE}/${profilePath}`);
  });
}

module.exports = {
  contactForLocationOnReady,
};
