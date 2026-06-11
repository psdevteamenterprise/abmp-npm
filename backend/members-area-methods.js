const { auth } = require('@wix/essentials');
const { members, authentication } = require('@wix/members');

const { LOGIN_EMAIL_SYNC_STATUS } = require('./consts');

const elevatedCreateMember = auth.elevate(members.createMember);
const elevatedChangeLoginEmail = auth.elevate(authentication.changeLoginEmail);

const LOG = '[loginEmailSync]';

function prepareMemberData(partner) {
  const options = {
    member: {
      loginEmail: partner.email,
      contact: {
        firstName: partner.firstName,
        lastName: partner.lastName,
      },
    },
  };
  return options;
}
async function createMemberFunction(member) {
  const newMember = await elevatedCreateMember(member);
  console.log('[createMemberFunction]newMember', JSON.stringify(newMember, null, 2));
  return newMember._id;
}
const createSiteMember = async memberDetails => {
  console.log('createSiteMember memberDetails', memberDetails);
  try {
    const options = prepareMemberData(memberDetails);
    return await createMemberFunction(options);
  } catch (error) {
    console.error(`Error in createSiteMember ${error.message}`);
    throw error;
  }
};

const getCurrentMember = async () => {
  const member = await members.getCurrentMember();
  return member.member;
};

/**
 * Attempts to change a Wix member's login email to `member.email` and reports a structured
 * outcome instead of swallowing failures. Never throws.
 *
 * Outcomes:
 *  - SKIPPED: member has no wixMemberId, nothing to change.
 *  - UPDATED: Wix login email changed successfully.
 *  - FAILED:  change failed. The caller keeps the CMS login email unchanged (so it stays
 *             consistent with Wix) and reports the member in the task result for manual handling.
 *
 * @param {Object} member - Member with { memberId, wixMemberId, email }
 * @returns {Promise<Object>} outcome
 */
async function updateWixMemberLoginEmail(member) {
  const desiredEmail = member.email;
  const base = { memberId: member.memberId, wixMemberId: member.wixMemberId, desiredEmail };

  if (!member.wixMemberId) {
    console.log(`${LOG} member ${member.memberId} has no wixMemberId - skipping`);
    return { ...base, status: LOGIN_EMAIL_SYNC_STATUS.SKIPPED };
  }

  console.log(
    `${LOG} attempting login-email change for member ${member.memberId} (wixMemberId: ${member.wixMemberId}) -> ${desiredEmail}`
  );

  try {
    const updatedWixMember = await elevatedChangeLoginEmail(member.wixMemberId, desiredEmail);
    console.log(
      `${LOG} ✅ updated member ${member.memberId} (wixMemberId: ${member.wixMemberId}) -> ${updatedWixMember.loginEmail}`
    );
    return { ...base, status: LOGIN_EMAIL_SYNC_STATUS.UPDATED };
  } catch (error) {
    console.error(
      `${LOG} ❌ login-email change failed for member ${member.memberId} (wixMemberId: ${member.wixMemberId}) -> ${desiredEmail}: ${error.message}`
    );
    return { ...base, status: LOGIN_EMAIL_SYNC_STATUS.FAILED, error: error.message };
  }
}

module.exports = {
  createSiteMember,
  getCurrentMember,
  updateWixMemberLoginEmail,
};
