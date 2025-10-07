const { items: wixData } = require('@wix/data');

const { COLLECTIONS } = require('../public');

const { createSiteMember } = require('./members-area-methods');

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
    const member = await wixData.get(COLLECTIONS.MEMBERS_DATA, memberId, {
      suppressAuth: true,
    });
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
    const updatedResult = await wixData.update(COLLECTIONS.MEMBERS_DATA, memberDataWithContactId, {
      suppressAuth: true,
    });
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

module.exports = {
  findMemberByWixDataId,
  createContactAndMemberIfNew,
};
