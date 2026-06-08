const { contacts } = require('@wix/crm');
const { auth } = require('@wix/essentials');

const elevatedGetContact = auth.elevate(contacts.getContact);
const elevatedUpdateContact = auth.elevate(contacts.updateContact);
const elevatedCreateContact = auth.elevate(contacts.createContact);
const elevatedDeleteContact = auth.elevate(contacts.deleteContact);

const deleteSiteContact = contactId => elevatedDeleteContact(contactId);

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
  // Intentionally NOT passing allowDuplicates: Wix CRM enforces email uniqueness
  // case-insensitively, which is the guard we want against two different members sharing an
  // email. Same-member cases never reach here — they collapse to a single entity upstream.
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
};
