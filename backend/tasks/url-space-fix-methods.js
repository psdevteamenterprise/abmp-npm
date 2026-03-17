const { taskManager } = require('psdev-task-manager');

const { COLLECTIONS } = require('../../public/consts');
const { ensureUniqueUrlsInBatch } = require('../daily-pull/bulk-process-methods');
const { ensureUniqueUrl } = require('../daily-pull/process-member-methods');
const { wixData } = require('../elevated-modules');
const { bulkSaveMembers, getMembersByIds } = require('../members-data-methods');
const { queryAllItems, chunkArray } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const CHUNK_SIZE = 1000;

const hasSpace = value => typeof value === 'string' && /\s/.test(value);

const normalizeSlug = value => (value || '').replace(/\s+/g, '').trim();

/**
 * Schedules tasks to fix member URLs that contain spaces.
 */
async function scheduleFixUrlsWithSpaces() {
  console.log('=== Scheduling Fix URLs With Spaces ===');

  try {
    const membersQuery = await wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .contains('url', ' ')
      .limit(1000);
    const members = await queryAllItems(membersQuery);
    console.log(`Fetched ${members.length} members with spaces in url`);

    const memberIds = [
      ...new Set(
        members
          .map(member => Number(member.memberId))
          .filter(memberId => Number.isFinite(memberId) && memberId > 0)
      ),
    ];
    console.log(`Members to fix: ${memberIds.length}`);

    if (memberIds.length === 0) {
      console.log('No members need URL space fixes');
      return {
        success: true,
        message: 'No members need URL space fixes',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    const chunks = chunkArray(memberIds, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const task = {
        name: TASKS_NAMES.fixUrlsWithSpacesChunk,
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
    console.error('Error scheduling URL space fixes:', error);
    throw error;
  }
}

/**
 * Processes a chunk of members and fixes URLs with spaces.
 */
async function fixUrlsWithSpacesChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing URL space fix chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    skippedIds: [],
    failedIds: [],
  };
  const updatedIds = [];

  try {
    const members = await getMembersByIds(memberIds);
    console.log(`Loaded ${members.length} members for this chunk`);

    const membersToUpdate = [];
    for (const member of members) {
      if (!hasSpace(member.url)) {
        result.skipped++;
        result.skippedIds.push(member.memberId);
        continue;
      }

      const normalized = normalizeSlug(member.url);
      const ensuredUrl = await ensureUniqueUrl({
        url: normalized,
        memberId: member.memberId,
        fullName: member.fullName,
      });

      if (!ensuredUrl || ensuredUrl === member.url) {
        result.skipped++;
        result.skippedIds.push(member.memberId);
        continue;
      }

      membersToUpdate.push({
        ...member,
        url: ensuredUrl,
      });
    }

    if (membersToUpdate.length === 0) {
      console.log('No members need updating in this batch');
      return result;
    }

    const uniqueUpdates = await ensureUniqueUrlsInBatch(membersToUpdate);
    uniqueUpdates.forEach(member => {
      if (updatedIds.length < 20) {
        updatedIds.push(member.memberId);
      }
    });

    try {
      await bulkSaveMembers(uniqueUpdates);
      result.successful += uniqueUpdates.length;
      console.log(`✅ Successfully updated ${uniqueUpdates.length} members`);
      if (updatedIds.length > 0) {
        console.log(`Updated memberIds (sample): ${updatedIds.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Error bulk saving members:', error);
      result.failed += uniqueUpdates.length;
      result.failedIds.push(...uniqueUpdates.map(member => member.memberId));
      result.errors.push({
        error: error.message,
        memberCount: uniqueUpdates.length,
      });
    }

    return result;
  } catch (error) {
    console.error(`Error processing URL space fix chunk ${chunkIndex}:`, error);
    throw error;
  }
}

module.exports = {
  scheduleFixUrlsWithSpaces,
  fixUrlsWithSpacesChunk,
};
