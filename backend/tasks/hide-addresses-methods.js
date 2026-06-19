const { taskManager } = require('psdev-task-manager');

const { COLLECTIONS, ADDRESS_STATUS_TYPES } = require('../../public/consts');
const { wixData } = require('../elevated-modules');
const { bulkSaveMembers, getMembersByIds } = require('../members-data-methods');
const { chunkArray, queryAllItems } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const CHUNK_SIZE = 1000;

const getMemberAddresses = member => (Array.isArray(member.addresses) ? member.addresses : []);

/**
 * Whether a member has at least one address that is not already hidden.
 * @param {Object} member
 * @returns {boolean}
 */
const hasVisibleAddress = member =>
  getMemberAddresses(member).some(
    address => address && address.addressStatus !== ADDRESS_STATUS_TYPES.DONT_SHOW
  );

/**
 * Sets every address on a member to DONT_SHOW (other address fields are preserved).
 * @param {Object} member
 * @returns {Array} the member's addresses with addressStatus set to DONT_SHOW
 */
const hideMemberAddresses = member =>
  getMemberAddresses(member).map(address => ({
    ...address,
    addressStatus: ADDRESS_STATUS_TYPES.DONT_SHOW,
  }));

/**
 * Schedules tasks to hide ALL addresses for ALL members that have any address.
 * Manually triggered (not cron-wired). Sets each address's addressStatus to DONT_SHOW.
 */
async function scheduleHideAllMemberAddresses() {
  console.log('=== Scheduling Hide All Member Addresses Tasks ===');

  try {
    const membersQuery = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .isNotEmpty('addresses')
      .limit(1000);
    const members = await queryAllItems(membersQuery);
    console.log(`Fetched ${members.length} members with addresses`);

    // Only members that still have at least one visible address need updating.
    const memberIds = [
      ...new Set(
        members
          .filter(hasVisibleAddress)
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];
    console.log(`Members with at least one visible address: ${memberIds.length}`);

    if (memberIds.length === 0) {
      console.log('No members need their addresses hidden');
      return {
        success: true,
        message: 'No members need their addresses hidden',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    const chunks = chunkArray(memberIds, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      await taskManager().schedule({
        name: TASKS_NAMES.hideMemberAddressesChunk,
        data: {
          memberIds: chunk,
          chunkIndex: i,
          totalChunks: chunks.length,
        },
        type: 'scheduled',
      });
      console.log(`Scheduled task ${i + 1}/${chunks.length} (${chunk.length} members)`);
    }

    const result = {
      success: true,
      message: `Scheduled ${chunks.length} tasks for ${memberIds.length} members`,
      totalMembers: memberIds.length,
      tasksScheduled: chunks.length,
    };
    console.log('=== Scheduling Complete ===');
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error scheduling hide-all-addresses:', error);
    throw error;
  }
}

/**
 * Processes a chunk of members and sets every address to DONT_SHOW.
 * @param {Object} data
 * @param {Array<number|string>} data.memberIds
 * @param {number} data.chunkIndex
 * @param {number} data.totalChunks
 */
async function hideMemberAddressesChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing hide-addresses chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = { successful: 0, failed: 0, skipped: 0, errors: [], failedIds: [] };

  try {
    const members = await getMembersByIds(memberIds);
    console.log(`Loaded ${members.length} members for this chunk`);

    const membersToUpdate = [];
    members.forEach(member => {
      // Skip members that have no address or are already fully hidden.
      if (!hasVisibleAddress(member)) {
        result.skipped++;
        return;
      }
      membersToUpdate.push({
        ...member,
        addresses: hideMemberAddresses(member),
      });
    });

    if (membersToUpdate.length === 0) {
      console.log('No members need updating in this batch');
      return result;
    }

    try {
      await bulkSaveMembers(membersToUpdate);
      result.successful += membersToUpdate.length;
      console.log(`✅ Successfully hid addresses for ${membersToUpdate.length} members`);
    } catch (error) {
      console.error('❌ Error bulk saving members:', error);
      result.failed += membersToUpdate.length;
      result.failedIds.push(...membersToUpdate.map(member => member.memberId));
      result.errors.push({ error: error.message, memberCount: membersToUpdate.length });
    }

    return result;
  } catch (error) {
    console.error(`Error processing hide-addresses chunk ${chunkIndex}:`, error);
    throw error;
  }
}

module.exports = {
  scheduleHideAllMemberAddresses,
  hideMemberAddressesChunk,
};
