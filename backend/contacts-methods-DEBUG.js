const { contacts } = require('@wix/crm');
const { auth } = require('@wix/essentials');

/**
 * DEBUG VERSION with extensive logging
 * This file helps investigate why contact email updates aren't working
 */

const elevatedGetContact = auth.elevate(contacts.getContact);
const elevatedUpdateContact = auth.elevate(contacts.updateContact);

/**
 * Generic contact update helper function - DEBUG VERSION
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {function} updateInfoCallback - Function that returns the updated info object
 * @param {string} operationName - Name of the operation for logging
 */
async function updateContactInfo(contactId, updateInfoCallback, operationName) {
  console.log(`[DEBUG] Starting ${operationName}`);
  console.log(`[DEBUG] contactId:`, contactId);

  if (!contactId) {
    console.error(`[DEBUG] ERROR: Contact ID is missing`);
    throw new Error('Contact ID is required');
  }

  try {
    console.log(`[DEBUG] Attempting to fetch contact...`);
    const contact = await elevatedGetContact(contactId);
    console.log(`[DEBUG] Contact fetched successfully:`, JSON.stringify(contact, null, 2));

    const currentInfo = contact.info;
    console.log(`[DEBUG] Current contact info:`, JSON.stringify(currentInfo, null, 2));

    const updatedInfo = updateInfoCallback(currentInfo);
    console.log(`[DEBUG] Updated info to send:`, JSON.stringify(updatedInfo, null, 2));

    console.log(`[DEBUG] Contact revision:`, contact.revision);
    console.log(`[DEBUG] Attempting to update contact...`);

    // Try the new way (wrapping in { info: })
    const result = await elevatedUpdateContact(contactId, { info: updatedInfo }, contact.revision);
    console.log(`[DEBUG] Update result:`, JSON.stringify(result, null, 2));

    console.log(`[DEBUG] ✅ ${operationName} completed successfully`);
    return result;
  } catch (error) {
    console.error(`[DEBUG] ❌ Error in ${operationName}:`, error);
    console.error(`[DEBUG] Error name:`, error.name);
    console.error(`[DEBUG] Error message:`, error.message);
    console.error(`[DEBUG] Error stack:`, error.stack);
    console.error(`[DEBUG] Full error object:`, JSON.stringify(error, null, 2));
    throw new Error(`Failed to ${operationName}: ${error.message}`);
  }
}

/**
 * Updates contact email in Wix CRM - DEBUG VERSION
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {string} newEmail - The new email address
 */
async function updateContactEmail(contactId, newEmail) {
  console.log(`[DEBUG] updateContactEmail called`);
  console.log(`[DEBUG] contactId:`, contactId);
  console.log(`[DEBUG] newEmail:`, newEmail);

  if (!newEmail) {
    console.error(`[DEBUG] ERROR: New email is missing`);
    throw new Error('New email is required');
  }

  return await updateContactInfo(
    contactId,
    currentInfo => {
      console.log(`[DEBUG] Building email update object...`);
      const result = {
        ...currentInfo,
        emails: {
          items: [
            {
              email: newEmail,
              primary: true,
            },
          ],
        },
      };
      console.log(`[DEBUG] Email update object built:`, JSON.stringify(result, null, 2));
      return result;
    },
    'update contact email'
  );
}

/**
 * Updates contact names in Wix CRM - DEBUG VERSION
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {string} firstName - The new first name
 * @param {string} lastName - The new last name
 */
async function updateContactNames(contactId, firstName, lastName) {
  console.log(`[DEBUG] updateContactNames called`);
  console.log(`[DEBUG] contactId:`, contactId);
  console.log(`[DEBUG] firstName:`, firstName);
  console.log(`[DEBUG] lastName:`, lastName);

  if (!firstName && !lastName) {
    console.error(`[DEBUG] ERROR: Both names are missing`);
    throw new Error('At least one name field is required');
  }

  return await updateContactInfo(
    contactId,
    currentInfo => {
      console.log(`[DEBUG] Building names update object...`);
      const result = {
        ...currentInfo,
        name: {
          first: firstName || currentInfo?.name?.first || '',
          last: lastName || currentInfo?.name?.last || '',
        },
      };
      console.log(`[DEBUG] Names update object built:`, JSON.stringify(result, null, 2));
      return result;
    },
    'update contact names'
  );
}

/**
 * Update fields if they have changed - DEBUG VERSION
 * @param {Array} existingValues - Current values for comparison
 * @param {Array} newValues - New values to compare against
 * @param {Function} updater - Function to call if values changed
 * @param {Function} argsBuilder - Function to build arguments for updater
 */
const updateIfChanged = (existingValues, newValues, updater, argsBuilder) => {
  console.log(`[DEBUG] updateIfChanged called`);
  console.log(`[DEBUG] existingValues:`, JSON.stringify(existingValues));
  console.log(`[DEBUG] newValues:`, JSON.stringify(newValues));

  const hasChanged = existingValues.some((val, idx) => {
    const changed = val !== newValues[idx];
    if (changed) {
      console.log(`[DEBUG] Value changed at index ${idx}: "${val}" -> "${newValues[idx]}"`);
    }
    return changed;
  });

  console.log(`[DEBUG] hasChanged:`, hasChanged);

  if (!hasChanged) {
    console.log(`[DEBUG] No changes detected, skipping update`);
    return null;
  }

  console.log(`[DEBUG] Changes detected, calling updater with args:`, argsBuilder(newValues));
  return updater(...argsBuilder(newValues));
};

/**
 * Updates member contact information in CRM if fields have changed - DEBUG VERSION
 * @param {Object} data - New member data
 * @param {Object} existingMemberData - Existing member data
 */
const updateMemberContactInfo = async (data, existingMemberData) => {
  console.log(`[DEBUG] ========================================`);
  console.log(`[DEBUG] updateMemberContactInfo called`);
  console.log(`[DEBUG] data:`, JSON.stringify(data, null, 2));
  console.log(`[DEBUG] existingMemberData:`, JSON.stringify(existingMemberData, null, 2));
  console.log(`[DEBUG] ========================================`);

  const { contactId } = existingMemberData;
  console.log(`[DEBUG] Extracted contactId:`, contactId);

  if (!contactId) {
    console.error(`[DEBUG] ERROR: contactId is missing from existingMemberData`);
    throw new Error('contactId is required in existingMemberData');
  }

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

  console.log(`[DEBUG] Processing update config...`);

  const updatePromises = updateConfig
    .map(({ fields, updater, args }, index) => {
      console.log(`[DEBUG] Config ${index}: fields=${JSON.stringify(fields)}`);
      const existingValues = fields.map(field => {
        const value = existingMemberData[field];
        console.log(`[DEBUG]   Existing ${field}:`, value);
        return value;
      });
      const newValues = fields.map(field => {
        const value = data[field];
        console.log(`[DEBUG]   New ${field}:`, value);
        return value;
      });
      return updateIfChanged(existingValues, newValues, updater, args);
    })
    .filter(Boolean);

  console.log(`[DEBUG] Number of updates to perform:`, updatePromises.length);

  if (updatePromises.length === 0) {
    console.log(`[DEBUG] No updates needed, returning early`);
    return;
  }

  console.log(`[DEBUG] Executing ${updatePromises.length} update(s) in parallel...`);

  try {
    const results = await Promise.all(updatePromises);
    console.log(`[DEBUG] All updates completed successfully`);
    console.log(`[DEBUG] Results:`, JSON.stringify(results, null, 2));
    console.log(`[DEBUG] ========================================`);
  } catch (error) {
    console.error(`[DEBUG] ❌ Error in Promise.all:`, error);
    console.error(`[DEBUG] Error details:`, JSON.stringify(error, null, 2));
    throw error;
  }
};

module.exports = {
  updateMemberContactInfo,
  updateContactEmail, // Export for individual testing
  updateContactNames, // Export for individual testing
};
