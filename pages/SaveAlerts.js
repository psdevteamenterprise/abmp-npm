const { lightbox } = require('@wix/site-window');

function saveAlertsOnReady({ $w: _$w }) {
  const receivedData = lightbox.getContext();
  _$w('#closeButton').onClick(async () => await lightbox.close());
  _$w('#cancelButton').onClick(async () => await lightbox.close());
  _$w('#leaveButton').link = receivedData?.membersExternalPortalUrl;
  _$w('#leaveButton').target = '_blank';
}

module.exports = {
  saveAlertsOnReady,
};
