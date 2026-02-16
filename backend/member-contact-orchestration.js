/**
 * Orchestrates syncing between Wix Members and CRM Contacts.
 * Returns member data to save; caller does a single updateMember to avoid double-write.
 */
const { createSiteContact, updateContactInfo, deleteSiteContact } = require('./contacts-methods');

/**
 * Updates contact email in CRM. Returns member patch { wixContactId } when member record
 * must change; otherwise null. Caller merges and saves once.
 */
async function updateContactEmail(newContactEmail, existingMemberData) {
  if (!newContactEmail) {
    throw new Error('New email is required');
  }
  if (!existingMemberData || existingMemberData.wixContactId == null) {
    throw new Error('Existing member data with wixContactId is required');
  }

  const { wixContactId, wixMemberId, email: loginEmail } = existingMemberData;
  const isSingleEntity = wixContactId === wixMemberId;
  const contactEmailDiffersFromLogin = loginEmail !== newContactEmail;

  if (!contactEmailDiffersFromLogin) {
    if (isSingleEntity) {
      return null;
    }
    await deleteSiteContact(wixContactId);
    return { wixContactId: wixMemberId };
  }

  if (isSingleEntity) {
    const newWixContactId = await createSiteContact({
      firstName: existingMemberData.firstName,
      lastName: existingMemberData.lastName,
      contactFormEmail: newContactEmail,
    });
    return { wixContactId: newWixContactId };
  }

  await updateContactInfo(
    wixContactId,
    currentInfo => ({
      ...currentInfo,
      emails: {
        items: [{ email: newContactEmail, primary: true }],
      },
    }),
    'update contact email'
  );
  return null;
}

async function updateContactNames({ wixContactId, firstName, lastName }) {
  if (!firstName && !lastName) {
    throw new Error('First name or last name is required');
  }
  const createNameUpdate = currentInfo => ({
    ...currentInfo,
    name: {
      first: firstName || currentInfo?.name?.first || '',
      last: lastName || currentInfo?.name?.last || '',
    },
  });
  return await updateContactInfo(wixContactId, createNameUpdate, 'update contact names');
}

/**
 * Syncs contact with member (email, names). Contact CRUD only; returns member data to save.
 * Caller must call updateMember once with the result.
 */
async function updateMemberContactInfo(data, existingMemberData) {
  const { wixContactId } = existingMemberData;
  if (!wixContactId) {
    throw new Error('Wix Contact ID is required');
  }
  const updateConfig = [
    {
      fields: ['contactFormEmail'],
      updater: updateContactEmail,
      args: ([email]) => [email, existingMemberData],
      returnsMemberPatch: true,
    },
    {
      fields: ['firstName', 'lastName'],
      updater: updateContactNames,
      args: ([firstName, lastName]) => [{ firstName, lastName, wixContactId }],
      returnsMemberPatch: false,
    },
  ];

  const results = await Promise.all(
    updateConfig.map(async ({ fields, updater, args, returnsMemberPatch }) => {
      const existingValues = fields.map(field => existingMemberData[field]);
      const newValues = fields.map(field => data[field]);
      const hasChanged = existingValues.some((val, idx) => val !== newValues[idx]);
      if (!hasChanged) return null;
      const result = await updater(...args(newValues));
      return returnsMemberPatch ? result : null;
    })
  );

  const memberPatch = results.reduce((acc, patch) => (patch ? { ...acc, ...patch } : acc), {});
  return { ...data, ...memberPatch };
}

module.exports = { updateMemberContactInfo };
