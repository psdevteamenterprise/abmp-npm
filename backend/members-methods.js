const { COLLECTIONS } = require('../public');
const { wixData } = require('./elevated-modules');

/**
 * Format date to Month Year format
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date as "Month Year"
 */
const formatDateToMonthYear = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  const options = { year: 'numeric', month: 'long' };
  return date.toLocaleDateString('en-US', options);
};

/**
 * Get address display options for a member
 * @param {Object} memberData - Member data object
 * @returns {Array} Address display options
 */
const getAddressDisplayOptions = (memberData) => {
  const addresses = Array.isArray(memberData.addresses) ? memberData.addresses : [];
  const existingOptions = Array.isArray(memberData.addressDisplayOption)
    ? memberData.addressDisplayOption
    : [];
  
  return addresses.map((addr) => {
    const existing = existingOptions.find((opt) => opt.key === addr.key);
    return existing || { key: addr.key, isMain: false };
  });
};

/**
 * Check if member is a student
 * @param {Object} memberData - Member data object
 * @returns {boolean} True if member is a student
 */
const isStudent = (memberData) => {
  const memberships = Array.isArray(memberData.memberships) ? memberData.memberships : [];
  return memberships.some(
    (membership) =>
      membership.association === 'ABMP' &&
      membership.status === 'Active' &&
      membership.membertype &&
      membership.membertype.toLowerCase().includes('student')
  );
};

/**
 * Validate member token and return member data
 * @param {string} memberIdInput - Member ID from query parameter
 * @param {Object} currentMember - Current member object from wix-members-backend
 * @returns {Promise<Object>} Object with memberData and isValid flag
 */
const validateMemberToken = async (memberIdInput, currentMember) => {
  const invalidTokenResponse = { memberData: null, isValid: false };
  
  if (!memberIdInput) {
    return invalidTokenResponse;
  }
  
  const member = await currentMember.getMember();
  if (!member || !member._id) {
    console.log('member not found from currentMember.getMember() for memberIdInput', memberIdInput);
    return invalidTokenResponse;
  }
  
  const { items } = await wixData
    .query(COLLECTIONS.MEMBERS_DATA)
    .eq('contactId', member._id)
    .find({ suppressAuth: true });
    
  console.log('items', items[0]);
  console.log('member._id', member._id);
  
  if (!items[0]?._id) {
    const errorMessage = `No record found in DB for logged in Member [Corrupted Data - Duplicate Members? ] - There is no match in DB for currentMember: ${JSON.stringify(
      { memberIdInput, currentMemberId: member._id }
    )}`;
    console.error(errorMessage);
    throw new Error('CORRUPTED_MEMBER_DATA');
  }
  
  console.log(`Id found in DB for memberIdInput :${memberIdInput} is ${items[0]?._id}`);
  
  const memberData = items[0];
  memberData.memberships = memberData.memberships.map((membership) => ({
    ...membership,
    membersince: formatDateToMonthYear(membership.membersince),
  }));
  
  const savedMemberId = memberData?._id;
  const isValid = savedMemberId === memberIdInput;
  
  if (!savedMemberId || !isValid) {
    return invalidTokenResponse;
  }
  
  memberData.addressDisplayOption = getAddressDisplayOptions(memberData);
  console.log('memberData', memberData);
  memberData.isStudent = isStudent(memberData);
  
  return { memberData, isValid };
};

/**
 * Get all interests from database
 * @returns {Promise<Array>} Array of interest titles sorted alphabetically
 */
const getInterestAll = async () => {
  try {
    let res = await wixData
      .query('interests')
      .limit(1000)
      .find({ suppressAuth: true });

    let interests = res.items.map((x) => x.title);

    while (res.hasNext()) {
      res = await res.next();
      interests.push(...res.items.map((x) => x.title));
    }

    // Sort the interests alphabetically (case-insensitive)
    interests = interests.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    return interests;
  } catch (e) {
    console.error('Error in getInterestAll:', e);
    return [];
  }
};

/**
 * Update contact email in Wix CRM
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {string} newEmail - The new email to set
 * @param {Object} contacts - Contacts module from wix-crm.v2
 * @param {Function} elevate - Elevate function from wix-auth
 */
async function updateContactEmail(contactId, newEmail, contacts, elevate) {
  if (!newEmail) {
    throw new Error('New email is required');
  }

  return updateContactInfo(
    contactId,
    (currentInfo) => ({
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
    'update contact email',
    contacts,
    elevate
  );
}

/**
 * Update contact names in Wix CRM
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {string} firstName - The new first name
 * @param {string} lastName - The new last name
 * @param {Object} contacts - Contacts module from wix-crm.v2
 * @param {Function} elevate - Elevate function from wix-auth
 */
async function updateContactNames(contactId, firstName, lastName, contacts, elevate) {
  if (!firstName && !lastName) {
    throw new Error('At least one name field is required');
  }

  return updateContactInfo(
    contactId,
    (currentInfo) => ({
      ...currentInfo,
      name: {
        first: firstName || currentInfo?.name?.first || '',
        last: lastName || currentInfo?.name?.last || '',
      },
    }),
    'update contact names',
    contacts,
    elevate
  );
}

/**
 * Generic contact update helper function
 * @param {string} contactId - The contact ID in Wix CRM
 * @param {function} updateInfoCallback - Function that returns the updated info object
 * @param {string} operationName - Name of the operation for logging
 * @param {Object} contacts - Contacts module from wix-crm.v2
 * @param {Function} elevate - Elevate function from wix-auth
 */
async function updateContactInfo(contactId, updateInfoCallback, operationName, contacts, elevate) {
  if (!contactId) {
    throw new Error('Contact ID is required');
  }

  try {
    const elevatedGetContact = elevate(contacts.getContact);
    const elevatedUpdateContact = elevate(contacts.updateContact);

    const currentContact = await elevatedGetContact(contactId);
    const updatedInfo = updateInfoCallback(currentContact.info);
    const updatedContact = await elevatedUpdateContact(contactId, updatedInfo, currentContact.revision);

    return updatedContact;
  } catch (error) {
    console.error(`Failed to ${operationName} for ${contactId}:`, error);
    throw new Error(`Failed to ${operationName} for ${contactId}: ${error.message}`);
  }
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
 * Find member by Wix Data ID
 * @param {string} id - Wix Data ID
 * @returns {Promise<Object>} Member data
 */
const findMemberByWixDataId = async (id) => {
  try {
    const member = await wixData.get(COLLECTIONS.MEMBERS_DATA, id, { suppressAuth: true });
    return member;
  } catch (error) {
    console.error('Error finding member by Wix Data ID:', error);
    throw error;
  }
};

/**
 * Update member contact information in CRM if fields have changed
 * @param {string} id - Member ID
 * @param {Object} data - New member data
 * @param {Object} contacts - Contacts module from wix-crm.v2
 * @param {Function} elevate - Elevate function from wix-auth
 */
const updateMemberContactInfo = async (id, data, contacts, elevate) => {
  const existing = await findMemberByWixDataId(id);
  const { contactId } = existing;

  const updateConfig = [
    {
      fields: ['contactFormEmail'],
      updater: (contactId, email) => updateContactEmail(contactId, email, contacts, elevate),
      args: ([email]) => [contactId, email],
    },
    {
      fields: ['firstName', 'lastName'],
      updater: (contactId, firstName, lastName) =>
        updateContactNames(contactId, firstName, lastName, contacts, elevate),
      args: ([firstName, lastName]) => [contactId, firstName, lastName],
    },
  ];

  const updatePromises = updateConfig
    .map(({ fields, updater, args }) => {
      const existingValues = fields.map((field) => existing[field]);
      const newValues = fields.map((field) => data[field]);
      return updateIfChanged(existingValues, newValues, updater, args);
    })
    .filter(Boolean);

  await Promise.all(updatePromises);
};

/**
 * Save registration data for a member
 * @param {Object} data - Member data to save
 * @param {string} id - Member ID
 * @param {Object} contacts - Contacts module from wix-crm.v2
 * @param {Function} elevate - Elevate function from wix-auth
 * @returns {Promise<Object>} Result object with type and saveData
 */
const saveRegistrationData = async (data, id, contacts, elevate) => {
  try {
    console.log('saveRegistrationData data._id', data._id);
    console.log('saveRegistrationData id', id);
    
    if (data._id !== id) return { type: 'notAuthorized' };

    await updateMemberContactInfo(id, data, contacts, elevate);

    const saveData = await wixData.update(COLLECTIONS.MEMBERS_DATA, data, {
      suppressAuth: true,
    });
    
    return {
      type: 'success',
      saveData,
    };
  } catch (error) {
    console.error(error);
    return {
      type: 'error',
      error,
    };
  }
};

module.exports = {
  validateMemberToken,
  saveRegistrationData,
  getInterestAll,
  formatDateToMonthYear,
  getAddressDisplayOptions,
  isStudent,
  findMemberByWixDataId,
  updateMemberContactInfo,
};

