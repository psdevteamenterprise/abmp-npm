const { contacts } = require('@wix/crm');
const { auth } = require('@wix/essentials');

const elevatedGetContact = auth.elevate(contacts.getContact);
const elevatedUpdateContact = auth.elevate(contacts.updateContact);

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
 * Updates contact names in Wix CRM
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {string} firstName - The new first name
 * @param {string} lastName - The new last name
 */
async function updateContactNames(contactId, firstName, lastName) {
  if (!firstName && !lastName) {
    throw new Error('At least one name field is required');
  }

  return await updateContactInfo(
    contactId,
    currentInfo => ({
      ...currentInfo,
      name: {
        first: firstName || currentInfo?.name?.first || '',
        last: lastName || currentInfo?.name?.last || '',
      },
    }),
    'update contact names'
  );
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
  const { contactId } = existingMemberData;

  const updateConfig = [
    {
      fields: ['contactFormEmail'],
      updater: updateContactEmail,
      args: ([email]) => [contactId, email],
    },
    {
      fields: ['firstName', 'lastName'],
      updater: updateContactNames,
      args: ([firstName, lastName]) => [contactId, firstName, lastName],
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
};
