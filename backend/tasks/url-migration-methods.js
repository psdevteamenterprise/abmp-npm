const { taskManager } = require('psdev-task-manager');

const { COLLECTIONS } = require('../../public/consts');
const { ensureUniqueUrl } = require('../daily-pull/process-member-methods');
const { wixData } = require('../elevated-modules');
const { bulkSaveMembers, findMemberById } = require('../members-data-methods');
const { queryAllItems, chunkArray } = require('../utils');

const { TASKS_NAMES } = require('./consts');

const COLLECTION_WITH_URLS = 'MembersDataWithUrls';
const CHUNK_SIZE = 5000; // 5k members per task

/**
 * Step 1: Migrate existing URLs from backup collection
 * Queries backup collection and schedules tasks with memberIds and URLs
 */
async function scheduleMigrateExistingUrls() {
  console.log('=== Scheduling Step 1: Migrate Existing URLs ===');

  try {
    const membersQuery = await wixData.query(COLLECTION_WITH_URLS);
    const membersWithUrls = await queryAllItems(membersQuery);

    const validMembers = membersWithUrls.filter(member => member.memberId && member.url);
    console.log(`${validMembers.length} members have valid memberId and URL`);

    if (validMembers.length === 0) {
      console.log('No members to migrate URLs for');
      return {
        success: true,
        message: 'No members need URL migration',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    const migrationData = validMembers.map(member => ({
      memberId: member.memberId,
      url: member.url,
    }));

    const chunks = chunkArray(migrationData, CHUNK_SIZE);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const task = {
        name: TASKS_NAMES.migrateUrlsChunk,
        data: {
          urlData: chunk,
          chunkIndex: i,
          totalChunks: chunks.length,
        },
        type: 'scheduled',
      };
      await taskManager().schedule(task);
      console.log(`Scheduled migration task ${i + 1}/${chunks.length} (${chunk.length} members)`);
    }

    const result = {
      success: true,
      message: `Scheduled ${chunks.length} tasks for ${validMembers.length} members`,
      totalMembers: validMembers.length,
      tasksScheduled: chunks.length,
    };

    console.log('=== Migration Scheduling Complete ===');
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('Error scheduling URL migration:', error);
    throw error;
  }
}

/**
 * Process a chunk of URL migrations (called by task manager)
 * Fetches members by memberId and updates with URLs using bulkSave
 */
async function migrateUrlsChunk(data) {
  const { urlData, chunkIndex, totalChunks } = data;
  console.log(
    `Processing migration chunk ${chunkIndex + 1}/${totalChunks} (${urlData.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    skippedIds: [],
  };

  try {
    const memberPromises = urlData.map(async ({ memberId, url }) => {
      try {
        const member = await findMemberById(memberId);

        if (!member) {
          console.log(`Member with memberId ${memberId} not found - skipping`);
          result.skipped++;
          result.skippedIds.push(memberId);
          return null;
        }

        if (member.url === url) {
          console.log(`Member ${member._id} already has URL ${url} - skipping`);
          result.skipped++;
          result.skippedIds.push(memberId);
          return null;
        }

        return {
          ...member,
          url: url,
        };
      } catch (error) {
        console.error(`Error preparing member ${memberId}:`, error);
        result.failed++;
        result.errors.push({ memberId, error: error.message });
        return null;
      }
    });

    const membersToUpdate = (await Promise.all(memberPromises)).filter(Boolean);

    if (membersToUpdate.length === 0) {
      console.log('No members need updating in this batch');
      return result;
    }

    console.log(
      `Started updating ${membersToUpdate.length} members with URLs in chunk ${chunkIndex}`
    );

    try {
      await bulkSaveMembers(membersToUpdate);
      result.successful += membersToUpdate.length;
      console.log(`✅ Successfully updated ${membersToUpdate.length} members`);
    } catch (error) {
      console.error(`❌ Error bulk saving members:`, error);
      result.failed += membersToUpdate.length;
      result.errors.push({
        error: error.message,
        memberCount: membersToUpdate.length,
      });
    }

    console.log(
      `Chunk ${chunkIndex + 1} complete: ${result.successful} success, ${result.failed} failed, ${result.skipped} skipped`
    );
    return result;
  } catch (error) {
    console.error(`Error processing migration chunk ${chunkIndex}:`, error);
    throw error;
  }
}

/**
 * Step 2: Generate URLs for members without URLs
 * Queries members without URLs and schedules generation tasks
 */
async function scheduleGenerateMissingUrls() {
  console.log('=== Scheduling Step 2: Generate Missing URLs ===');

  try {
    const membersQuery = await wixData.query(COLLECTIONS.MEMBERS_DATA).isEmpty('url');
    const membersToUpdate = await queryAllItems(membersQuery);

    console.log(`Found ${membersToUpdate.length} members without URLs`);

    if (membersToUpdate.length === 0) {
      console.log('No members need URL generation');
      return {
        success: true,
        message: 'No members need URL generation',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    const chunks = chunkArray(membersToUpdate, CHUNK_SIZE);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const task = {
        name: TASKS_NAMES.generateUrlsChunk,
        data: {
          memberIds: chunk.map(m => m._id),
          chunkIndex: i,
          totalChunks: chunks.length,
        },
        type: 'scheduled',
      };
      await taskManager().schedule(task);
      console.log(`Scheduled generation task ${i + 1}/${chunks.length} (${chunk.length} members)`);
    }

    const result = {
      success: true,
      message: `Scheduled ${chunks.length} tasks for ${membersToUpdate.length} members`,
      totalMembers: membersToUpdate.length,
      tasksScheduled: chunks.length,
    };

    console.log('=== Generation Scheduling Complete ===');
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('Error scheduling URL generation:', error);
    throw error;
  }
}

/**
 * Process a chunk of URL generation (called by task manager)
 * Fetches members, generates URLs, and bulk saves
 */
async function generateUrlsChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing generation chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    skippedIds: [],
  };

  try {
    const memberPromises = memberIds.map(async memberId => {
      try {
        const member = await findMemberById(memberId);

        if (!member) {
          console.log(`Member ${memberId} not found - skipping`);
          result.skipped++;
          result.skippedIds.push(memberId);
          return null;
        }

        if (member.url) {
          console.log(`Member ${memberId} already has URL - skipping`);
          result.skipped++;
          result.skippedIds.push(memberId);
          return null;
        }

        const name = member.fullName || `${member.firstName || ''} ${member.lastName || ''}`.trim();

        if (!name) {
          throw new Error(`Member ${memberId} has no name data`);
        }

        const uniqueUrl = await ensureUniqueUrl({
          url: '',
          memberId: member._id,
          fullName: name,
        });

        console.log(`✅ Generated URL for member ${memberId}: ${uniqueUrl}`);
        return {
          ...member,
          url: uniqueUrl,
        };
      } catch (error) {
        console.error(`❌ Failed to generate URL for member ${memberId}:`, error);
        result.failed++;
        result.errors.push({
          memberId,
          error: error.message || 'Unknown error',
        });
        return null;
      }
    });

    const membersToUpdate = (await Promise.all(memberPromises)).filter(Boolean);

    if (membersToUpdate.length === 0) {
      console.log('No members need updating in this batch');
      return result;
    }

    console.log(
      `Started updating ${membersToUpdate.length} members with generated URLs in chunk ${chunkIndex}`
    );

    try {
      await bulkSaveMembers(membersToUpdate);
      result.successful += membersToUpdate.length;
      console.log(`✅ Successfully updated ${membersToUpdate.length} members`);
    } catch (error) {
      console.error(`❌ Error bulk saving members:`, error);
      result.failed += membersToUpdate.length;
      result.errors.push({
        error: error.message,
        memberCount: membersToUpdate.length,
      });
    }

    console.log(
      `Chunk ${chunkIndex + 1} complete: ${result.successful} success, ${result.failed} failed, ${result.skipped} skipped`
    );
    return result;
  } catch (error) {
    console.error(`Error processing generation chunk ${chunkIndex}:`, error);
    throw error;
  }
}

module.exports = {
  scheduleMigrateExistingUrls,
  migrateUrlsChunk,
  scheduleGenerateMissingUrls,
  generateUrlsChunk,
  TASKS_NAMES,
};
