const { lightbox } = require('@wix/site-window');

const { ABMP_MEMBERS_HOME_URL } = require('../public/consts');

function saveAlertsOnReady({ $w: _$w }) {
  _$w('#closeButton').onClick(async () => await lightbox.close());
  _$w('#cancelButton').onClick(async () => await lightbox.close());
  _$w('#leaveButton').link = ABMP_MEMBERS_HOME_URL;
  _$w('#leaveButton').target = '_blank';
}

module.exports = {
  saveAlertsOnReady,
};
