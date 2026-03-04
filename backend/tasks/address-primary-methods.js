const { taskManager } = require('psdev-task-manager');

const { COLLECTIONS, ADDRESS_STATUS_TYPES } = require('../../public/consts');
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

const getPrimaryAddressKey = addressDisplayOption =>
  Array.isArray(addressDisplayOption)
    ? addressDisplayOption.find(option => option?.isMain === true)?.key
    : null;

const needsPrimaryAddressVisibilityFix = (address, index) => {
  if (!address) {
    return false;
  }
  const status = address?.addressStatus;
  if (index === 0 && status === ADDRESS_STATUS_TYPES.DONT_SHOW) {
    return true;
  }
  return !status || status === ADDRESS_STATUS_TYPES.DONT_SHOW;
};

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
      if (addresses.length <= 1) {
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
    console.log(`Members with multiple addresses and no primary: ${memberIds.length}`);

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
  const skippedNoMultiAddress = [];
  const skippedHasPrimary = [];
  const updatedIds = [];

  try {
    const members = await getMembersByIds(memberIds);
    console.log(`Loaded ${members.length} members for this chunk`);
    const membersToUpdate = [];

    members.forEach(member => {
      const addresses = Array.isArray(member.addresses) ? member.addresses : [];
      if (addresses.length <= 1) {
        result.skipped++;
        result.skippedIds.push(member.memberId);
        if (skippedNoMultiAddress.length < 20) {
          skippedNoMultiAddress.push(member.memberId);
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

    if (skippedNoMultiAddress.length > 0) {
      console.log(`Skipped (<=1 address) sample: ${skippedNoMultiAddress.join(', ')}`);
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
 * Schedules tasks to fix primary address visibility when missing or DONT_SHOW.
 */
async function scheduleFixPrimaryAddressVisibilityForMembers() {
  console.log('=== Scheduling Fix Primary Address Visibility Tasks ===');

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
      const primaryKey = getPrimaryAddressKey(member.addressDisplayOption);
      if (!primaryKey) {
        return false;
      }
      const addressIndex = addresses.findIndex(address => getAddressKey(address, 0) === primaryKey);
      if (addressIndex === -1) {
        return false;
      }
      return needsPrimaryAddressVisibilityFix(addresses[addressIndex], addressIndex);
    });

    const memberIds = [
      ...new Set(
        membersToFix
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];
    console.log(`Members with primary address visibility issues: ${memberIds.length}`);

    if (memberIds.length === 0) {
      console.log('No members need primary address visibility fixes');
      return {
        success: true,
        message: 'No members need primary address visibility fixes',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    const chunks = chunkArray(memberIds, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const task = {
        name: TASKS_NAMES.fixPrimaryAddressVisibilityChunk,
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
    console.error('Error scheduling primary address visibility fix:', error);
    throw error;
  }
}

/**
 * Processes a chunk of members and fixes primary address visibility when missing or DONT_SHOW.
 */
async function fixPrimaryAddressVisibilityChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing primary address visibility chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    skippedIds: [],
    failedIds: [],
  };
  const skippedNoPrimary = [];
  const skippedNoAddressMatch = [];
  const updatedIds = [];

  try {
    const members = await getMembersByIds(memberIds);
    console.log(`Loaded ${members.length} members for this chunk`);
    const membersToUpdate = [];

    members.forEach(member => {
      const addresses = Array.isArray(member.addresses) ? member.addresses : [];
      const primaryKey = getPrimaryAddressKey(member.addressDisplayOption);
      if (!primaryKey) {
        result.skipped++;
        result.skippedIds.push(member.memberId);
        if (skippedNoPrimary.length < 20) {
          skippedNoPrimary.push(member.memberId);
        }
        return;
      }

      const addressIndex = addresses.findIndex(address => getAddressKey(address, 0) === primaryKey);
      if (addressIndex === -1) {
        result.skipped++;
        result.skippedIds.push(member.memberId);
        if (skippedNoAddressMatch.length < 20) {
          skippedNoAddressMatch.push(member.memberId);
        }
        return;
      }

      const targetAddress = addresses[addressIndex];
      if (!needsPrimaryAddressVisibilityFix(targetAddress, addressIndex)) {
        result.skipped++;
        result.skippedIds.push(member.memberId);
        return;
      }

      const updatedAddresses = addresses.map((address, index) => {
        if (index !== addressIndex) {
          return address;
        }
        return {
          ...address,
          addressStatus: ADDRESS_STATUS_TYPES.STATE_CITY_ZIP,
        };
      });

      membersToUpdate.push({
        ...member,
        addresses: updatedAddresses,
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

    if (skippedNoPrimary.length > 0) {
      console.log(`Skipped (no primary address) sample: ${skippedNoPrimary.join(', ')}`);
    }
    if (skippedNoAddressMatch.length > 0) {
      console.log(
        `Skipped (primary address not found) sample: ${skippedNoAddressMatch.join(', ')}`
      );
    }

    return result;
  } catch (error) {
    console.error(`Error processing primary address visibility chunk ${chunkIndex}:`, error);
    throw error;
  }
}

module.exports = {
  scheduleFixPrimaryAddressForMembers,
  fixPrimaryAddressChunk,
  scheduleFixPrimaryAddressVisibilityForMembers,
  fixPrimaryAddressVisibilityChunk,
};
