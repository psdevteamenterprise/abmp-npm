const { taskManager } = require('psdev-task-manager');

const {
  bulkSaveMembers,
  getMembersByIds,
  getAllMembersNeedingEmailNormalization,
  memberNeedsEmailNormalization,
} = require('../members-data-methods');
const { chunkArray } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const CHUNK_SIZE = 1000;

/**
 * One-off backfill: schedules tasks to normalize (lowercase + trim) the email and
 * contactFormEmail fields of existing members so stored values match the normalize-on-write
 * behavior, keeping case-insensitive uniqueness lookups reliable.
 */
async function scheduleNormalizeMemberEmails() {
  console.log('=== Scheduling Member Email Normalization ===');

  try {
    const members = await getAllMembersNeedingEmailNormalization();
    console.log(`Fetched ${members.length} members needing email normalization`);

    const memberIds = [
      ...new Set(
        members
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];
    console.log(`Members to normalize: ${memberIds.length}`);

    if (memberIds.length === 0) {
      console.log('No members need email normalization');
      return {
        success: true,
        message: 'No members need email normalization',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    const chunks = chunkArray(memberIds, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const task = {
        name: TASKS_NAMES.normalizeMemberEmailsChunk,
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
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('Error scheduling member email normalization:', error);
    throw error;
  }
}

/**
 * Processes a chunk of members, normalizing their email fields.
 * bulkSaveMembers normalizes on write, so we only need to select the members that still
 * have non-canonical values and save them.
 */
async function normalizeMemberEmailsChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing email normalization chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    failedIds: [],
  };

  try {
    const members = await getMembersByIds(memberIds);
    console.log(`Loaded ${members.length} members for this chunk`);

    const membersToUpdate = members.filter(memberNeedsEmailNormalization);
    result.skipped = members.length - membersToUpdate.length;

    if (membersToUpdate.length === 0) {
      console.log('No members need updating in this batch');
      return result;
    }

    try {
      await bulkSaveMembers(membersToUpdate);
      result.successful += membersToUpdate.length;
      console.log(`✅ Successfully normalized ${membersToUpdate.length} members`);
    } catch (error) {
      console.error('❌ Error bulk saving members:', error);
      result.failed += membersToUpdate.length;
      result.failedIds.push(...membersToUpdate.map(member => member.memberId));
      result.errors.push({
        error: error.message,
        memberCount: membersToUpdate.length,
      });
    }

    return result;
  } catch (error) {
    console.error(`Error processing email normalization chunk ${chunkIndex}:`, error);
    throw error;
  }
}

module.exports = {
  scheduleNormalizeMemberEmails,
  normalizeMemberEmailsChunk,
};
