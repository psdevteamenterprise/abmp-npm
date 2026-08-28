const { taskManager } = require('psdev-task-manager');

const {
  memberNeedsAssociationExpirationBackfill,
  resolveAssociationExpiration,
  summarizeExpirationOutcomes,
  ASSOCIATION_EXPIRATION_FIELD,
  EXPIRATION_OUTCOMES,
} = require('../association-expiry');
const { CONFIG_KEYS } = require('../consts');
const { bulkSaveMembers, getMembersByIds, getAllMembers } = require('../members-data-methods');
const { chunkArray, getSiteConfigs } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const CHUNK_SIZE = 1000;

/**
 * One-off backfill of associationExpiration for members the daily sync will not touch.
 * @param {Object} [data]
 * @param {boolean} [data.dryRun] count without writing
 */
async function scheduleAssociationExpiryBackfill(data = {}) {
  // process() receives whatever getIdentifier returns. A sentinel string there would read as
  // dryRun: false and write to every member instead of counting them.
  if (data === null || typeof data !== 'object') {
    throw new Error(
      `scheduleAssociationExpiryBackfill expected its task data object but received ${typeof data}. ` +
        'Check getIdentifier for this task in tasks-configs.js: it must be `task => task.data`.'
    );
  }

  const dryRun = data.dryRun === true;
  console.log(`=== Scheduling Association Expiry Backfill${dryRun ? ' (DRY RUN)' : ''} ===`);

  try {
    const siteAssociation = await getSiteConfigs(CONFIG_KEYS.SITE_ASSOCIATION);
    if (!siteAssociation) {
      // Every member would resolve to null, i.e. hidden.
      throw new Error('SITE_ASSOCIATION is not configured; refusing to run the backfill');
    }

    const members = await getAllMembers();
    console.log(`Fetched ${members.length} members for association '${siteAssociation}'`);

    // Over every member, not just those needing a write, so a re-run still reports the true total.
    const outcomes = summarizeExpirationOutcomes(members, siteAssociation);
    const hiddenByThisChange =
      outcomes[EXPIRATION_OUTCOMES.NO_MEMBERSHIP_FOR_ASSOCIATION] +
      outcomes[EXPIRATION_OUTCOMES.MISSING_EXPIRATION] +
      outcomes[EXPIRATION_OUTCOMES.UNREADABLE_EXPIRATION];

    console.log(`Outcome breakdown: ${JSON.stringify(outcomes)}`);
    console.log(
      `Will resolve to no date, so hidden once the query gates on it: ${hiddenByThisChange} of ${members.length}`
    );

    const memberIds = [
      ...new Set(
        members
          .filter(member => memberNeedsAssociationExpirationBackfill(member, siteAssociation))
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];
    console.log(`Members whose stored value is out of date: ${memberIds.length}`);

    const summary = {
      success: true,
      dryRun,
      siteAssociation,
      totalMembers: members.length,
      outcomes,
      hiddenByThisChange,
      membersNeedingUpdate: memberIds.length,
      tasksScheduled: 0,
    };

    if (dryRun) {
      summary.message = `Dry run: nothing written. ${hiddenByThisChange} of ${members.length} members resolve to no date`;
      console.log('=== Dry Run Complete, nothing written ===');
      console.log(JSON.stringify(summary, null, 2));
      return summary;
    }

    if (memberIds.length === 0) {
      summary.message = 'Every member already has the correct associationExpiration';
      console.log(summary.message);
      return summary;
    }

    const chunks = chunkArray(memberIds, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      await taskManager().schedule({
        name: TASKS_NAMES.associationExpiryBackfillChunk,
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
    console.error('Error scheduling association expiry backfill:', error);
    throw error;
  }
}

/**
 * Members are reloaded and re-resolved rather than trusting the queued data: a chunk can run long
 * after it was scheduled, and the daily sync may have rewritten the record in between.
 */
async function associationExpiryBackfillChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing association expiry chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    failedIds: [],
  };

  try {
    const siteAssociation = await getSiteConfigs(CONFIG_KEYS.SITE_ASSOCIATION);
    if (!siteAssociation) {
      throw new Error('SITE_ASSOCIATION is not configured; refusing to write');
    }

    const members = await getMembersByIds(memberIds);
    console.log(`Loaded ${members.length} members for this chunk`);

    const membersToUpdate = members
      .filter(member => memberNeedsAssociationExpirationBackfill(member, siteAssociation))
      .map(member => ({
        ...member,
        [ASSOCIATION_EXPIRATION_FIELD]: resolveAssociationExpiration(member, siteAssociation),
      }));

    result.skipped = members.length - membersToUpdate.length;
    result.outcomes = summarizeExpirationOutcomes(members, siteAssociation);

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
    console.error(`Error processing association expiry chunk ${chunkIndex}:`, error);
    throw error;
  }
}

module.exports = {
  scheduleAssociationExpiryBackfill,
  associationExpiryBackfillChunk,
};
