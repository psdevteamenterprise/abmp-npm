const { contacts } = require('@wix/crm');
const { auth } = require('@wix/essentials');

const elevatedGetContact = auth.elevate(contacts.getContact);
const elevatedUpdateContact = auth.elevate(contacts.updateContact);
const elevatedCreateContact = auth.elevate(contacts.createContact);

/**
 * Create a contact in Wix CRM
 * @param {Object} contactData - Contact data
 * @param {boolean} allowDuplicates - Allow duplicates if contact with same email already exists, will be true only when handling existing members, after that should be removed
 * @returns {Promise<Object>} - Contact data
 */
async function createSiteContact(contactData, allowDuplicates = false) {
  if (!contactData || !(contactData.contactFormEmail || contactData.email)) {
    throw new Error('Contact data is required');
  }
  const phones =
    Array.isArray(contactData.phones) && contactData.phones.length > 0 ? contactData.phones : [];
  const contactInfo = {
    name: {
      first: contactData.firstName,
      last: contactData.lastName,
    },
    emails: {
      items: [{ email: contactData.contactFormEmail || contactData.email, primary: true }],
    },
    phones: { items: phones.map(phone => ({ phone })) },
  };
  const createContactResponse = await elevatedCreateContact(contactInfo, { allowDuplicates });
  return createContactResponse.contact._id;
}
/**
 * Generic contact update helper function
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {function} updateInfoCallback - Function that returns the updated info object
 * @param {string} operationName - Name of the operation for logging
 */
async function updateContactInfo(contactId, updateInfoCallback, operationName) {
  if (!contactId) {
    throw new Error('Contact ID is required');
  }

  try {
    const contact = await elevatedGetContact(contactId);
    const currentInfo = contact.info;
    const updatedInfo = updateInfoCallback(currentInfo);

    await elevatedUpdateContact(contactId, updatedInfo, contact.revision);
  } catch (error) {
    console.error(`Error in ${operationName}:`, error);
    throw new Error(`Failed to ${operationName}: ${error.message}`);
  }
}

/**
 * Updates contact email in Wix CRM
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {string} newEmail - The new email address
 */
async function updateContactEmail(contactId, newEmail) {
  if (!newEmail) {
    throw new Error('New email is required');
  }

  return await updateContactInfo(
    contactId,
    currentInfo => ({
      ...currentInfo,
      emails: {
        items: [
          {
            email: newEmail,
            primary: true,
          },
        ],
      },
    }),
    'update contact email'
  );
}

/**
 * Updates contact names in Wix CRM for both contact and member
 * @param {Object} params - Parameters object
 * @param {string} params.wixContactId - The contact ID in Wix CRM
 * @param {string} params.wixMemberId - The member ID in Wix CRM
 * @param {string} params.firstName - The new first name
 * @param {string} params.lastName - The new last name
 */
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
 * Update fields if they have changed
 * @param {Array} existingValues - Current values for comparison
 * @param {Array} newValues - New values to compare against
 * @param {Function} updater - Function to call if values changed
 * @param {Function} argsBuilder - Function to build arguments for updater
 */
const updateIfChanged = (existingValues, newValues, updater, argsBuilder) => {
  const hasChanged = existingValues.some((val, idx) => val !== newValues[idx]);
  if (!hasChanged) return null;
  return updater(...argsBuilder(newValues));
};

/**
 * Updates member contact information in CRM if fields have changed
 * @param {Object} data - New member data
 * @param {Object} existingMemberData - Existing member data
 */
const updateMemberContactInfo = async (data, existingMemberData) => {
  const { wixContactId } = existingMemberData;
  if (!wixContactId) {
    throw new Error('Wix Contact ID is required');
  }
  const updateConfig = [
    {
      fields: ['contactFormEmail'],
      updater: updateContactEmail,
      args: ([email]) => [wixContactId, email],
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
};

module.exports = {
  updateMemberContactInfo,
  createSiteContact,
};
