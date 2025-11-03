const { COLLECTIONS } = require('../public/consts');

const { MEMBER_ACTIONS } = require('./consts');
const { wixData } = require('./elevated-modules');
const { createSiteMember, getCurrentMember } = require('./members-area-methods');
const { formatDateToMonthYear, getAddressDisplayOptions, isStudent } = require('./utils');

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

module.exports = {
  findMemberByWixDataId,
  createContactAndMemberIfNew,
  validateMemberToken,
};
