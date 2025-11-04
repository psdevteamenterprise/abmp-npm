const { CONFIG_KEYS } = require('./consts');
const { MEMBER_ACTIONS } = require('./daily-pull');
const { getCurrentMember } = require('./members-area-methods');
const { getMemberByContactId } = require('./members-data-methods');
const {
  formatDateToMonthYear,
  getAddressDisplayOptions,
  isStudent,
  getSiteConfigs,
} = require('./utils');

/**
 * Validates member token and retrieves member data
 * @param {string} memberIdInput - The member ID to validate
 * @returns {Promise<{memberData: Object|null, isValid: boolean}>} Validation result with member data
 */
async function validateMemberToken(memberIdInput) {
  const invalidTokenResponse = { memberData: null, isValid: false };

  if (!memberIdInput) {
    return invalidTokenResponse;
  }

  try {
    const member = await getCurrentMember();
    if (!member || !member._id) {
      console.log(
        'member not found from members.getCurrentMember() for memberIdInput',
        memberIdInput
      );
      return invalidTokenResponse;
    }

    const [dbMember, siteConfigs] = await Promise.all([
      getMemberByContactId(member._id),
      getSiteConfigs(),
    ]);
    const siteAssociation = siteConfigs[CONFIG_KEYS.SITE_ASSOCIATION];
    const membersExternalPortalUrl = siteConfigs[CONFIG_KEYS.MEMBERS_EXTERNAL_PORTAL_URL];
    console.log('dbMember by contact id is:', dbMember);
    console.log('member._id', member._id);

    if (!dbMember?._id) {
      const errorMessage = `No record found in DB for logged in Member [Corrupted Data - Duplicate Members? ] - There is no match in DB for currentMember: ${JSON.stringify(
        { memberIdInput, currentMemberId: member._id }
      )}`;
      console.error(errorMessage);
      throw new Error('CORRUPTED_MEMBER_DATA');
    }

    console.log(`Id found in DB for memberIdInput :${memberIdInput} is ${dbMember?._id}`);

    const memberData = dbMember;

    // Format membership dates
    memberData.memberships = memberData.memberships.map(membership => ({
      ...membership,
      membersince: formatDateToMonthYear(membership.membersince),
      isSiteAssociation: membership.association === siteAssociation,
    }));

    const savedMemberId = memberData?._id;
    const isValid = savedMemberId === memberIdInput;

    if (!savedMemberId || !isValid) {
      return invalidTokenResponse;
    }

    // Check if member is dropped
    if (memberData.action === MEMBER_ACTIONS.DROP) {
      return invalidTokenResponse;
    }

    // Add computed properties
    memberData.addressDisplayOption = getAddressDisplayOptions(memberData);
    console.log('memberData', memberData);
    memberData.isStudent = isStudent(memberData);

    return { memberData, isValid, membersExternalPortalUrl };
  } catch (error) {
    console.error('Error in validateMemberToken:', error);
    throw error;
  }
}

module.exports = {
  validateMemberToken,
};
