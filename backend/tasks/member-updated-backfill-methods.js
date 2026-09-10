const { taskManager } = require('psdev-task-manager');

const {
  MEMBER_UPDATED_FIELD,
  memberNeedsUpdatedFlagBackfill,
  summarizeUpdatedOutcomes,
} = require('../listing-priority');
const { bulkSaveMembers, getMembersByIds, getAllMembers } = require('../members-data-methods');
const { chunkArray } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const CHUNK_SIZE = 1000;

/**
 * One-off backfill of memberUpdated for members who filled their listing out before the flag
 * existed. Sets the flag true and never false: it records that the member has been in, so a
 * listing that was filled and later emptied keeps it.
 * @param {Object} [data]
 * @param {boolean} [data.dryRun] count without writing
 */
async function scheduleMemberUpdatedBackfill(data = {}) {
  // process() receives whatever getIdentifier returns. A sentinel string there would read as
  // dryRun: false and write to every member instead of counting them.
  if (data === null || typeof data !== 'object') {
    throw new Error(
      `scheduleMemberUpdatedBackfill expected its task data object but received ${typeof data}. ` +
        'Check getIdentifier for this task in tasks-configs.js: it must be `task => task.data`.'
    );
  }

  const dryRun = data.dryRun === true;
  console.log(`=== Scheduling Member Updated Backfill${dryRun ? ' (DRY RUN)' : ''} ===`);

  try {
    const members = await getAllMembers();
    console.log(`Fetched ${members.length} members`);

    // Over every member, not just those needing a write, so a re-run still reports the true split.
    const outcomes = summarizeUpdatedOutcomes(members);
    const tierOneShare = members.length
      ? ((outcomes.tierOne / members.length) * 100).toFixed(1)
      : '0.0';

    console.log(`Outcome breakdown: ${JSON.stringify(outcomes)}`);
    console.log(`Will rank first: ${outcomes.tierOne} of ${members.length} (${tierOneShare}%)`);

    const memberIds = [
      ...new Set(
        members
          .filter(memberNeedsUpdatedFlagBackfill)
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];
    console.log(`Members whose flag is not yet set: ${memberIds.length}`);

    const summary = {
      success: true,
      dryRun,
      totalMembers: members.length,
      outcomes,
      tierOneShare: `${tierOneShare}%`,
      membersNeedingUpdate: memberIds.length,
      tasksScheduled: 0,
    };

    if (dryRun) {
      summary.message = `Dry run: nothing written. ${outcomes.tierOne} of ${members.length} members (${tierOneShare}%) would rank first`;
      console.log('=== Dry Run Complete, nothing written ===');
      console.log(JSON.stringify(summary, null, 2));
      return summary;
    }

    if (memberIds.length === 0) {
      summary.message = 'Every member who has entered content is already flagged';
      console.log(summary.message);
      return summary;
    }

    const chunks = chunkArray(memberIds, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      await taskManager().schedule({
        name: TASKS_NAMES.memberUpdatedBackfillChunk,
        data: { memberIds: chunks[i], chunkIndex: i, totalChunks: chunks.length },
        type: 'scheduled',
      });
      console.log(`Scheduled task ${i + 1}/${chunks.length} (${chunks[i].length} members)`);
    }

    summary.tasksScheduled = chunks.length;
    summary.message = `Scheduled ${chunks.length} tasks for ${memberIds.length} members`;

    console.log('=== Scheduling Complete ===');
    console.log(JSON.stringify(summary, null, 2));

    return summary;
  } catch (error) {
    console.error('Error scheduling member updated backfill:', error);
    throw error;
  }
}

/**
 * Members are reloaded and re-checked rather than trusting the queued data: a chunk can run long
 * after it was scheduled, and the member may have saved their form in between.
 */
async function memberUpdatedBackfillChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing member updated chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
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

    const membersToUpdate = members
      .filter(memberNeedsUpdatedFlagBackfill)
      .map(member => ({ ...member, [MEMBER_UPDATED_FIELD]: true }));

    result.skipped = members.length - membersToUpdate.length;

    if (membersToUpdate.length === 0) {
      console.log('No members need updating in this batch');
      return result;
    }

    try {
      await bulkSaveMembers(membersToUpdate);
      result.successful += membersToUpdate.length;
      console.log(`✅ Successfully backfilled ${membersToUpdate.length} members`);
    } catch (error) {
      console.error('❌ Error bulk saving members:', error);
      result.failed += membersToUpdate.length;
      result.failedIds.push(...membersToUpdate.map(member => member.memberId));
      result.errors.push({ error: error.message, memberCount: membersToUpdate.length });
    }

    return result;
  } catch (error) {
    console.error(`Error processing member updated chunk ${chunkIndex}:`, error);
    throw error;
  }
}

module.exports = {
  scheduleMemberUpdatedBackfill,
  memberUpdatedBackfillChunk,
};
