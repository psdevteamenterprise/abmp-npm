const PAGE_NAME = 'Learn More';
const BUTTON_NAME = 'Upgrade Now';

/**
 * Creates the Learn More popup handler
 * @param {Object} params - Parameters
 * @param {Function} params.$w - Wix $w selector
 * @param {Function} params.trackClick - Backend function to track the click (handles member lookup internally)
 */
function learnMoreOnReady({ $w: _$w, trackClick }) {
  _$w('#learnMoreBtn').onClick(async () => {
    try {
      await trackClick({
        pageName: PAGE_NAME,
        buttonName: BUTTON_NAME,
      });

      console.log(`Tracked ${BUTTON_NAME} click on ${PAGE_NAME}`);
    } catch (error) {
      console.error('Error tracking button click:', error);
    }
  });
}

module.exports = {
  learnMoreOnReady,
};
