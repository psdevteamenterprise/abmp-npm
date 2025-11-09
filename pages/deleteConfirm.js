const { lightbox } = require('@wix/site-window');

function deleteConfirmOnReady({ $w: _$w }) {
  _$w('#delete').onClick(() => {
    lightbox.close({
      toDelete: true,
    });
  });

  _$w('#cancel').onClick(() => {
    lightbox.close({
      toDelete: false,
    });
  });
}

module.exports = {
  deleteConfirmOnReady,
};
