const { lightbox } = require('@wix/site-window');

async function saveAlertsOnReady({ $w: _$w }) {
  const receivedData = await lightbox.getContext();
  _$w('#closeButton').onClick(() => lightbox.close());
  _$w('#cancelButton').onClick(() => lightbox.close());
  _$w('#leaveButton').link = receivedData?.membersExternalPortalUrl;
  _$w('#leaveButton').target = '_blank';
}

module.exports = {
  saveAlertsOnReady,
};
