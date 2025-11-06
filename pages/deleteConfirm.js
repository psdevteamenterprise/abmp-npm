const { window } = require('@wix/site-window');

function deleteConfirmOnReady({ $w: _$w }) {
  _$w('#delete').onClick(() => {
    window.lightbox.close({
      toDelete: true,
    });
  });

  _$w('#cancel').onClick(() => {
    window.lightbox.close({
      toDelete: false,
    });
  });
}

module.exports = {
  deleteConfirmOnReady,
};
