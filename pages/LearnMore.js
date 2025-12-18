const { currentMember } = require('@wix/members');

const PAGE_NAME = 'Learn More';
const BUTTON_NAME = 'Upgrade Now';

/**
 * Creates the Learn More popup handler
 * @param {Object} params - Parameters
 * @param {Function} params.$w - Wix $w selector
 * @param {Function} params.trackClick - Backend function to track the click
 * @param {Function} params.getMemberByContactId - Backend function to get member data by contact ID
 */
function learnMoreOnReady({ $w: _$w, trackClick, getMemberByContactId }) {
  _$w('#learnMoreBtn').onClick(async () => {
    try {
      const wixMember = await currentMember.getMember();

      if (wixMember) {
        const dbMember = await getMemberByContactId(wixMember._id);

        if (!dbMember) {
          console.warn('Member not found in MembersDataLatest');
          return;
        }

        const memberName = dbMember.fullName || 'Unknown';
        const memberId = dbMember.memberId;

        await trackClick({
          memberName,
          memberId,
          pageName: PAGE_NAME,
          buttonName: BUTTON_NAME,
        });

        console.log(`Tracked ${BUTTON_NAME} click on ${PAGE_NAME} for member:`, memberId);
      }
    } catch (error) {
      console.error('Error tracking button click:', error);
    }
  });
}

module.exports = {
  learnMoreOnReady,
};
