const { taskManager } = require('psdev-task-manager');

const { COLLECTIONS, ADDRESS_STATUS_TYPES } = require('../../public/consts');
const { wixData } = require('../elevated-modules');
const { bulkSaveMembers, getMembersByIds } = require('../members-data-methods');
const { chunkArray, queryAllItems } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const CHUNK_SIZE = 1000;

// Target visibility for every address: show city / state / zip, hide the street address.
const TARGET_STATUS = ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;

const getMemberAddresses = member => (Array.isArray(member.addresses) ? member.addresses : []);

/**
 * Whether a member has at least one address not already at the target status.
 * @param {Object} member
 * @returns {boolean}
 */
const needsCityStateUpdate = member =>
  getMemberAddresses(member).some(address => address && address.addressStatus !== TARGET_STATUS);

/**
 * Sets every address on a member to STATE_CITY_ZIP (other address fields are preserved).
 * @param {Object} member
 * @returns {Array} the member's addresses with addressStatus set to STATE_CITY_ZIP
 */
const setAddressesToCityState = member =>
  getMemberAddresses(member).map(address => ({
    ...address,
    addressStatus: TARGET_STATUS,
  }));

/**
 * Schedules tasks to set ALL addresses for ALL members to STATE_CITY_ZIP (show city/state/zip,
 * hide the street). Manually triggered (not cron-wired).
 */
async function scheduleSetAddressesToCityState() {
  console.log('=== Scheduling Set Addresses To City/State Tasks ===');

  try {
    const membersQuery = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .isNotEmpty('addresses')
      .limit(1000);
    const members = await queryAllItems(membersQuery);
    console.log(`Fetched ${members.length} members with addresses`);

    // Only members that still have an address not at the target status need updating.
    const memberIds = [
      ...new Set(
        members
          .filter(needsCityStateUpdate)
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];
    console.log(`Members needing a city/state update: ${memberIds.length}`);

    if (memberIds.length === 0) {
      console.log('No members need their addresses set to city/state');
      return {
        success: true,
        message: 'No members need their addresses set to city/state',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    const chunks = chunkArray(memberIds, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      await taskManager().schedule({
        name: TASKS_NAMES.setAddressesToCityStateChunk,
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
    console.error('Error scheduling set-addresses-to-city-state:', error);
    throw error;
  }
}

/**
 * Processes a chunk of members and sets every address to STATE_CITY_ZIP.
 * @param {Object} data
 * @param {Array<number|string>} data.memberIds
 * @param {number} data.chunkIndex
 * @param {number} data.totalChunks
 */
async function setAddressesToCityStateChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing set-city-state chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = { successful: 0, failed: 0, skipped: 0, errors: [], failedIds: [] };

  try {
    const members = await getMembersByIds(memberIds);
    console.log(`Loaded ${members.length} members for this chunk`);

    const membersToUpdate = [];
    members.forEach(member => {
      // Skip members that have no address or are already all at the target status.
      if (!needsCityStateUpdate(member)) {
        result.skipped++;
        return;
      }
      membersToUpdate.push({
        ...member,
        addresses: setAddressesToCityState(member),
      });
    });

    if (membersToUpdate.length === 0) {
      console.log('No members need updating in this batch');
      return result;
    }

    try {
      await bulkSaveMembers(membersToUpdate);
      result.successful += membersToUpdate.length;
      console.log(`✅ Set addresses to city/state for ${membersToUpdate.length} members`);
    } catch (error) {
      console.error('❌ Error bulk saving members:', error);
      result.failed += membersToUpdate.length;
      result.failedIds.push(...membersToUpdate.map(member => member.memberId));
      result.errors.push({ error: error.message, memberCount: membersToUpdate.length });
    }

    return result;
  } catch (error) {
    console.error(`Error processing set-city-state chunk ${chunkIndex}:`, error);
    throw error;
  }
}

module.exports = {
  scheduleSetAddressesToCityState,
  setAddressesToCityStateChunk,
};
