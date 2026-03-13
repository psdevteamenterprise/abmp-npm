const { taskManager } = require('psdev-task-manager');

const { COLLECTIONS } = require('../../public/consts');
const { wixData } = require('../elevated-modules');
const { bulkSaveMembers, getMembersByIds } = require('../members-data-methods');
const { chunkArray, queryAllItems } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const CHUNK_SIZE = 1000;

const getAddressKey = (address, index) =>
  address?.key || address?.addressid || address?.addressId || `address_${index}`;

const hasPrimaryAddress = addressDisplayOption =>
  Array.isArray(addressDisplayOption) &&
  addressDisplayOption.some(option => option?.isMain === true);

/**
 * Schedules tasks to fix members with multiple addresses and no primary address.
 */
async function scheduleFixPrimaryAddressForMembers() {
  console.log('=== Scheduling Fix Primary Address Tasks ===');

  try {
    const membersQuery = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .isNotEmpty('addresses')
      .limit(1000);
    const members = await queryAllItems(membersQuery);
    console.log(`Fetched ${members.length} members with addresses`);

    const membersToFix = members.filter(member => {
      const addresses = Array.isArray(member.addresses) ? member.addresses : [];
      if (addresses.length === 0) {
        return false;
      }
      return !hasPrimaryAddress(member.addressDisplayOption);
    });

    const memberIds = [
      ...new Set(
        membersToFix
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];
    console.log(`Members with addresses and no primary: ${memberIds.length}`);

    if (memberIds.length === 0) {
      console.log('No members need primary address fixes');
      return {
        success: true,
        message: 'No members need primary address fixes',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    const chunks = chunkArray(memberIds, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const task = {
        name: TASKS_NAMES.fixPrimaryAddressChunk,
        data: {
          memberIds: chunk,
          chunkIndex: i,
          totalChunks: chunks.length,
        },
        type: 'scheduled',
      };
      await taskManager().schedule(task);
      console.log(`Scheduled task ${i + 1}/${chunks.length} (${chunk.length} members)`);
    }

    const result = {
      success: true,
      message: `Scheduled ${chunks.length} tasks for ${memberIds.length} members`,
      totalMembers: memberIds.length,
      tasksScheduled: chunks.length,
    };

    console.log('=== Scheduling Complete ===');
    console.log(`Sample memberIds: ${memberIds.slice(0, 10).join(', ')}`);
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('Error scheduling primary address fix:', error);
    throw error;
  }
}

/**
 * Processes a chunk of members and sets the first address as primary
 * when a member has multiple addresses and no primary address.
 */
async function fixPrimaryAddressChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing primary address fix chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    skippedIds: [],
    failedIds: [],
  };
  const skippedNoAddress = [];
  const skippedHasPrimary = [];
  const updatedIds = [];

  try {
    const members = await getMembersByIds(memberIds);
    console.log(`Loaded ${members.length} members for this chunk`);
    const membersToUpdate = [];

    members.forEach(member => {
      const addresses = Array.isArray(member.addresses) ? member.addresses : [];
      if (addresses.length === 0) {
        result.skipped++;
        result.skippedIds.push(member.memberId);
        if (skippedNoAddress.length < 20) {
          skippedNoAddress.push(member.memberId);
        }
        return;
      }
      if (hasPrimaryAddress(member.addressDisplayOption)) {
        result.skipped++;
        result.skippedIds.push(member.memberId);
        if (skippedHasPrimary.length < 20) {
          skippedHasPrimary.push(member.memberId);
        }
        return;
      }

      const firstKey = getAddressKey(addresses[0], 0);
      const normalizedAddresses = addresses.map((address, index) => {
        if (index !== 0 || address?.key) {
          return address;
        }
        return { ...address, key: firstKey };
      });

      const updatedDisplayOptions = Array.isArray(member.addressDisplayOption)
        ? member.addressDisplayOption.map(option => ({
            ...option,
            isMain: false,
          }))
        : [];

      const existingOption = updatedDisplayOptions.find(option => option?.key === firstKey);
      if (existingOption) {
        existingOption.isMain = true;
      } else {
        updatedDisplayOptions.push({ key: firstKey, isMain: true });
      }

      membersToUpdate.push({
        ...member,
        addresses: normalizedAddresses,
        addressDisplayOption: updatedDisplayOptions,
      });
      if (updatedIds.length < 20) {
        updatedIds.push(member.memberId);
      }
    });

    if (membersToUpdate.length === 0) {
      console.log('No members need updating in this batch');
      return result;
    }

    try {
      await bulkSaveMembers(membersToUpdate);
      result.successful += membersToUpdate.length;
      console.log(`✅ Successfully updated ${membersToUpdate.length} members`);
      if (updatedIds.length > 0) {
        console.log(`Updated memberIds (sample): ${updatedIds.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Error bulk saving members:', error);
      result.failed += membersToUpdate.length;
      result.failedIds.push(...membersToUpdate.map(member => member.memberId));
      result.errors.push({
        error: error.message,
        memberCount: membersToUpdate.length,
      });
    }

    if (skippedNoAddress.length > 0) {
      console.log(`Skipped (no addresses) sample: ${skippedNoAddress.join(', ')}`);
    }
    if (skippedHasPrimary.length > 0) {
      console.log(`Skipped (already has primary) sample: ${skippedHasPrimary.join(', ')}`);
    }

    return result;
  } catch (error) {
    console.error(`Error processing primary address fix chunk ${chunkIndex}:`, error);
    throw error;
  }
}

/**
 * Returns count of members with addresses but no primary address.
 */
async function countMembersMissingPrimaryAddress() {
  console.log('=== Counting Members Missing Primary Address ===');

  try {
    const membersQuery = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .isNotEmpty('addresses')
      .limit(1000);
    const members = await queryAllItems(membersQuery);
    console.log(`Fetched ${members.length} members with addresses`);

    const membersToFix = members.filter(member => {
      const addresses = Array.isArray(member.addresses) ? member.addresses : [];
      if (addresses.length === 0) {
        return false;
      }
      return !hasPrimaryAddress(member.addressDisplayOption);
    });

    const memberIds = [
      ...new Set(
        membersToFix
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];

    const result = {
      success: true,
      totalMembers: memberIds.length,
      sampleMemberIds: memberIds.slice(0, 20),
    };

    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error counting members missing primary address:', error);
    throw error;
  }
}

module.exports = {
  scheduleFixPrimaryAddressForMembers,
  fixPrimaryAddressChunk,
  countMembersMissingPrimaryAddress,
};
