const { contacts } = require('@wix/crm');

const { COLLECTIONS } = require('../public/consts');

const { MEMBER_ACTIONS } = require('./consts');
const { wixData } = require('./elevated-modules');
const { createSiteMember, getCurrentMember } = require('./members-area-methods');
const {
  formatDateToMonthYear,
  getAddressDisplayOptions,
  isStudent,
  generateGeoHash,
  urlExists,
} = require('./utils');

/**
 * Retrieves member data by member ID
 * @param {string} memberId - The member ID to search for
 * @returns {Promise<Object|null>} - Member data or null if not found
 */
async function findMemberByWixDataId(memberId) {
  if (!memberId) {
    throw new Error('Member ID is required');
  }
  try {
    const member = await wixData.get(COLLECTIONS.MEMBERS_DATA, memberId);
    return member;
  } catch (error) {
    throw new Error(`Failed to retrieve member data: ${error.message}`);
  }
}

async function createContactAndMemberIfNew(memberData) {
  if (!memberData) {
    throw new Error('Member data is required');
  }
  try {
    const toCreateMemberData = {
      firstName: memberData.firstName,
      lastName: memberData.lastName,
      email: memberData.email,
      phones: memberData.phones,
      contactFormEmail: memberData.contactFormEmail || memberData.email,
    };
    const contactId = await createSiteMember(toCreateMemberData);
    let memberDataWithContactId = {
      ...memberData,
      contactId,
    };
    const updatedResult = await wixData.update(COLLECTIONS.MEMBERS_DATA, memberDataWithContactId);
    memberDataWithContactId = {
      ...memberDataWithContactId,
      ...updatedResult,
    };
    return memberDataWithContactId;
  } catch (error) {
    console.error('Error creating contact and member if new:', error);
    throw new Error(`Failed to create contact and member if new: ${error.message}`);
  }
}

/**
 * Validates member token and retrieves member data
 * @param {string} memberIdInput - The member ID to validate
 * @returns {Promise<{memberData: Object|null, isValid: boolean}>} Validation result with member data
 */
async function validateMemberToken(memberIdInput) {
  const invalidTokenResponse = { memberData: null, isValid: false };

  if (!memberIdInput) {
    return invalidTokenResponse;
  }

  try {
    const member = await getCurrentMember();
    if (!member || !member._id) {
      console.log(
        'member not found from members.getCurrentMember() for memberIdInput',
        memberIdInput
      );
      return invalidTokenResponse;
    }

    // Query member data using elevated permissions (suppressAuth equivalent)
    const { items } = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .eq('contactId', member._id)
      .find();

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

    // Format membership dates
    memberData.memberships = memberData.memberships.map(membership => ({
      ...membership,
      membersince: formatDateToMonthYear(membership.membersince),
    }));

    const savedMemberId = memberData?._id;
    const isValid = savedMemberId === memberIdInput;

    if (!savedMemberId || !isValid) {
      return invalidTokenResponse;
    }

    // Check if member is dropped
    if (memberData.action === MEMBER_ACTIONS.DROP) {
      return invalidTokenResponse;
    }

    // Add computed properties
    memberData.addressDisplayOption = getAddressDisplayOptions(memberData);
    console.log('memberData', memberData);
    memberData.isStudent = isStudent(memberData);

    return { memberData, isValid };
  } catch (error) {
    console.error('Error in validateMemberToken:', error);
    throw error;
  }
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
    const contact = await contacts.getContact(contactId);
    const currentInfo = contact.info;
    const updatedInfo = updateInfoCallback(currentInfo);

    await contacts.updateContact(contactId, { info: updatedInfo });
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
 * @param {string} id - Member ID
 * @param {Object} data - New member data
 */
const updateMemberContactInfo = async (id, data) => {
  const existing = await findMemberByWixDataId(id);
  const { contactId } = existing;

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
      const existingValues = fields.map(field => existing[field]);
      const newValues = fields.map(field => data[field]);
      return updateIfChanged(existingValues, newValues, updater, args);
    })
    .filter(Boolean);

  await Promise.all(updatePromises);
};

/**
 * Saves member registration data
 * @param {Object} data - Member data to save
 * @param {string} id - Member ID
 * @returns {Promise<Object>} Result object with type and data/error
 */
async function saveRegistrationData(data, id) {
  try {
    console.log(' saveRegistrationData data._id', data._id);
    console.log(' saveRegistrationData id', id);
    if (data._id !== id) return { type: 'notAuthorized' };

    if (data.url) {
      const isDuplicate = await urlExists(data.url, data.memberId);

      if (isDuplicate) {
        return {
          type: 'error',
          error: 'URL slug is already taken. Please choose a different one.',
        };
      }
    }

    if (data.addresses && Array.isArray(data.addresses)) {
      data.locHash = generateGeoHash(data.addresses);
    }

    await updateMemberContactInfo(id, data);

    const saveData = await wixData.update(COLLECTIONS.MEMBERS_DATA, data);
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
}

module.exports = {
  findMemberByWixDataId,
  createContactAndMemberIfNew,
  validateMemberToken,
  saveRegistrationData,
};
