const { lightbox } = require('@wix/site-window');

function selectBannerImagesOnReady({ $w: _$w }) {
  _$w('#imageDataset').onReady(async () => {
    const numOfItems = _$w('#imageDataset').getTotalCount();
    const result = await _$w('#imageDataset').getItems(0, numOfItems);
    const items = result.items;
    console.log('Loaded items from dataset:', items);

    _$w('#bannerImagesRepeater').data = items;
  });

  _$w('#bannerImagesRepeater').onItemReady(($item, itemData, index) => {
    $item('#bannerImage').src = itemData.image; // image field
    $item('#bannerSelected').checked = false;

    // Only one checkbox can be selected
    $item('#bannerSelected').onChange(() => {
      if ($item('#bannerSelected').checked) {
        _$w('#bannerImagesRepeater').forEachItem(($otherItem, _, otherIndex) => {
          if (otherIndex !== index) {
            $otherItem('#bannerSelected').checked = false;
          }
        });
      }
    });
  });

  _$w('#uploadSelectedImages').onClick(() => {
    let selectedImage = null;

    _$w('#bannerImagesRepeater').forEachItem(($item, itemData) => {
      if ($item('#bannerSelected').checked) {
        selectedImage = {
          image: itemData.image,
          title: itemData.title,
        };
      }
    });
    lightbox.close(selectedImage);
  });
}

module.exports = {
  selectBannerImagesOnReady,
};
