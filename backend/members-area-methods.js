const { auth } = require('@wix/essentials');
const { members } = require('@wix/members');
const elevatedCreateMember = auth.elevate(members.createMember);

function prepareContactData(partner) {
  const phones = Array.isArray(partner.phones) ? partner.phones : []; //some users don't have phones
  const options = {
    member: {
      contact: {
        ...partner,
        phones,
        emails: [partner.contactFormEmail || partner.email],
      },
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
    const options = prepareContactData(memberDetails);
    const contactId = await createMemberFunction(options);
    return contactId;
  } catch (error) {
    console.error(`Error in createSiteMember ${error.message}`);
    throw error;
  }
};

module.exports = {
  createSiteMember,
};
