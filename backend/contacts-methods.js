const { contacts } = require('@wix/crm');
const { auth } = require('@wix/essentials');

const elevatedGetContact = auth.elevate(contacts.getContact);
const elevatedUpdateContact = auth.elevate(contacts.updateContact);
const elevatedCreateContact = auth.elevate(contacts.createContact);
const elevatedDeleteContact = auth.elevate(contacts.deleteContact);

const deleteSiteContact = contactId => elevatedDeleteContact(contactId);

/**
 * Builds contact payload from member data. Reusable for createSiteContact callers.
 * @param {Object} memberData - Member data (firstName, lastName, email, phones, contactFormEmail)
 * @param {Object} [overrides] - Optional overrides (e.g. { contactFormEmail: newEmail })
 * @returns {Object} - Shape expected by createSiteContact
 */
function contactDataFromMember(memberData, overrides = {}) {
  return {
    firstName: memberData.firstName,
    lastName: memberData.lastName,
    email: memberData.email,
    phones: memberData.phones,
    contactFormEmail: memberData.contactFormEmail || memberData.email,
    ...overrides,
  };
}

/**
 * Create a contact in Wix CRM
 * @param {Object} contactData - Contact data
 * @returns {Promise<Object>} - Contact data
 */
async function createSiteContact(contactData) {
  console.log('[createSiteContact]contactData', JSON.stringify(contactData, null, 2));
  if (!contactData || !contactData.contactFormEmail) {
    throw new Error('Contact data is required');
  }
  const contactInfo = {
    name: {
      first: contactData.firstName,
      last: contactData.lastName,
    },
    emails: {
      items: [{ email: contactData.contactFormEmail, primary: true }],
    },
  };
  console.log('[createSiteContact]contactInfo', JSON.stringify(contactInfo, null, 2));
  const createContactResponse = await elevatedCreateContact(contactInfo);
  console.log(
    '[createSiteContact]createContactResponse',
    JSON.stringify(createContactResponse, null, 2)
  );
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

module.exports = {
  createSiteContact,
  updateContactInfo,
  deleteSiteContact,
  contactDataFromMember,
};
