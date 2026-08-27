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
 * One-off backfill of associationExpiration for members that predate the field.
 *
 * Runs per site, and only ever reads this site's own association out of the memberships array -
 * the ABMP site stores the ABMP date and nothing else. See PLAN-per-association-expiry.md.
 *
 * Pass `{ dryRun: true }` to count without writing anything. That mode exists for a specific
 * commitment: PAC chose to hide members whose expiration is missing or unreadable (Drew Zarn,
 * 2026-08-26), against our recommendation, and we said we would report how many existing records
 * that actually affects before any of it goes live. A dry run answers that in one task, with no
 * writes and nothing to undo.
 *
 * @param {Object} [data]
 * @param {boolean} [data.dryRun=false]
 * @returns {Promise<Object>} summary, including the per-outcome breakdown
 */
async function scheduleAssociationExpiryBackfill(data = {}) {
  // The task manager calls process() with whatever getIdentifier returns. If that is ever changed
  // to a sentinel string, destructuring it yields dryRun: undefined, which reads as false - a dry
  // run would then write to every member on the site instead of counting them. Refuse rather than
  // guess, because the wrong guess here is unrecoverable.
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
      // Without it every member would resolve to null, i.e. hidden. Refuse rather than wipe a site.
      throw new Error('SITE_ASSOCIATION is not configured; refusing to run the backfill');
    }

    const members = await getAllMembers();
    console.log(`Fetched ${members.length} members for association '${siteAssociation}'`);

    // Counted over every member, not just the ones needing a write, so re-running after a partial
    // failure still reports the true population rather than only the remainder.
    const outcomes = summarizeExpirationOutcomes(members, siteAssociation);
    const hiddenByThisChange =
      outcomes[EXPIRATION_OUTCOMES.NO_MEMBERSHIP_FOR_ASSOCIATION] +
      outcomes[EXPIRATION_OUTCOMES.MISSING_EXPIRATION] +
      outcomes[EXPIRATION_OUTCOMES.UNREADABLE_EXPIRATION];

    console.log(`Outcome breakdown: ${JSON.stringify(outcomes)}`);
    console.log(
      `Members that will resolve to no date, and so be hidden once the query gates on it: ${hiddenByThisChange} of ${members.length}`
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
 * Writes associationExpiration for one chunk of members.
 *
 * Members are reloaded and re-resolved here rather than trusting anything carried through the task
 * queue: a chunk can run well after it was scheduled, and the daily sync may have rewritten the
 * record in between.
 *
 * @param {Object} data
 * @param {Array<number>} data.memberIds
 * @param {number} data.chunkIndex
 * @param {number} data.totalChunks
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
