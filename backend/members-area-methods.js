const { auth } = require('@wix/essentials');
const { members, authentication } = require('@wix/members');
const elevatedCreateMember = auth.elevate(members.createMember);
const eleveatedChangeLoginEmail = auth.elevate(authentication.changeLoginEmail);

function prepareMemberData(partner) {
  // const phones = Array.isArray(partner.phones) ? partner.phones : []; //some users don't have phones
  const options = {
    member: {
      // //Keeping contact creation in member data for future purposes, in case we need to use it later
      // contact: {
      //   ...partner,
      //   phones,
      //   emails: [partner.contactFormEmail || partner.email],
      // },
      loginEmail: partner.email,
    },
  };
  return options;
}
async function createMemberFunction(member) {
  const newMember = await elevatedCreateMember(member);
  return newMember._id;
}
const createSiteMember = async memberDetails => {
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
 * Updates Wix member login email if the member has a wixMemberId (registered Wix member)
 * @param {Object} member - Member object with wixMemberId and email
 * @param {Object} result - Result object to track Wix member updates
 */
async function updateWixMemberLoginEmail(member, result = {}) {
  if (!member.wixMemberId) {
    console.log(`Member ${member.memberId} has no wixMemberId - skipping Wix login email update`);
    return;
  }

  try {
    console.log(
      `Updating Wix login email for member ${member.memberId} (wixMemberId: ${member.wixMemberId})`
    );

    const updatedWixMember = await eleveatedChangeLoginEmail(member.wixMemberId, member.email);

    console.log(
      `✅ Successfully updated Wix login email for member ${member.memberId}: ${updatedWixMember.loginEmail}`
    );

    if (!result.wixMemberUpdates) {
      result.wixMemberUpdates = { successful: 0, failed: 0 };
    }
    result.wixMemberUpdates.successful++;
  } catch (error) {
    console.error(`❌ Failed to update Wix login email for member ${member.memberId}:`, error);

    if (!result.wixMemberUpdates) {
      result.wixMemberUpdates = { successful: 0, failed: 0 };
    }
    result.wixMemberUpdates.failed++;

    if (!result.wixMemberErrors) {
      result.wixMemberErrors = [];
    }
    result.wixMemberErrors.push({
      memberId: member.memberId,
      wixMemberId: member.wixMemberId,
      email: member.email,
      error: error.message,
    });
  }
}

module.exports = {
  createSiteMember,
  getCurrentMember,
  updateWixMemberLoginEmail,
};
