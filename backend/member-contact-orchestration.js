/**
 * Orchestrates syncing between Wix Members and CRM Contacts.
 * Depends only on contact CRUD; updateMember is injected by members-data-methods to avoid circular deps.
 */
const { createSiteContact, updateContactInfo, deleteSiteContact } = require('./contacts-methods');

/**
 * Creates orchestration functions that sync member and contact data.
 * @param {Object} deps - Dependencies from the member layer
 * @param {Function} deps.updateMember - Saves member data (from members-data-methods)
 * @returns {{ updateMemberContactInfo: Function }}
 */
function createMemberContactOrchestration({ updateMember }) {
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
        return;
      }
      await deleteSiteContact(wixContactId);
      await updateMember({ ...existingMemberData, wixContactId: wixMemberId });
      return;
    }

    if (isSingleEntity) {
      const newWixContactId = await createSiteContact({
        firstName: existingMemberData.firstName,
        lastName: existingMemberData.lastName,
        contactFormEmail: newContactEmail,
      });
      await updateMember({ ...existingMemberData, wixContactId: newWixContactId });
      return;
    }

    return updateContactInfo(
      wixContactId,
      currentInfo => ({
        ...currentInfo,
        emails: {
          items: [{ email: newContactEmail, primary: true }],
        },
      }),
      'update contact email'
    );
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

  const updateIfChanged = (existingValues, newValues, updater, argsBuilder) => {
    const hasChanged = existingValues.some((val, idx) => val !== newValues[idx]);
    if (!hasChanged) return null;
    return updater(...argsBuilder(newValues));
  };

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
      },
      {
        fields: ['firstName', 'lastName'],
        updater: updateContactNames,
        args: ([firstName, lastName]) => [{ firstName, lastName, wixContactId }],
      },
    ];

    const updatePromises = updateConfig
      .map(({ fields, updater, args }) => {
        const existingValues = fields.map(field => existingMemberData[field]);
        const newValues = fields.map(field => data[field]);
        return updateIfChanged(existingValues, newValues, updater, args);
      })
      .filter(Boolean);

    await Promise.all(updatePromises);
  }

  return { updateMemberContactInfo };
}

module.exports = { createMemberContactOrchestration };
