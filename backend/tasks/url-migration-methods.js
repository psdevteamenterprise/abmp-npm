const { taskManager } = require('psdev-task-manager');

const { ensureUniqueUrl } = require('../daily-pull/process-member-methods');
const { wixData } = require('../elevated-modules');
const { queryAllItems, chunkArray } = require('../utils');

const COLLECTION_LATEST = 'MembersDataLatest';
const COLLECTION_WITH_URLS = 'MembersDataWithUrls';
const CHUNK_SIZE = 10000; // 10k members per task
const BATCH_SIZE = 50; // URL generation batch size
const DELAY_BETWEEN_BATCHES = 100; // ms

// Task names
const TASKS_NAMES = {
  scheduleMigrateExistingUrls: 'scheduleMigrateExistingUrls',
  migrateUrlsChunk: 'migrateUrlsChunk',
  scheduleGenerateMissingUrls: 'scheduleGenerateMissingUrls',
  generateUrlsChunk: 'generateUrlsChunk',
};

/**
 * Step 1: Schedule Phase 2 - Migrate existing URLs from backup collection
 * This function queries members without URLs, finds matches in backup, and schedules tasks
 */
async function scheduleMigrateExistingUrls() {
  console.log('=== Scheduling Phase 2: Migrate Existing URLs ===');

  try {
    // Get all members from backup with URLs
    const membersWithUrls = await queryAllItems(wixData.query(COLLECTION_WITH_URLS));
    console.log(`Found ${membersWithUrls.length} members in backup collection`);

    // Create URL lookup map from backup
    const urlMap = new Map();
    membersWithUrls.forEach(member => {
      if (member.memberId && member.url) {
        urlMap.set(member.memberId, member.url);
      }
    });
    console.log(`Created URL map with ${urlMap.size} entries`);

    // Query members without URLs
    const membersToUpdate = await wixData
      .query(COLLECTION_LATEST)
      .isEmpty('url')
      .limit(1000)
      .find()
      .then(results => queryAllItems(results));

    console.log(`Found ${membersToUpdate.length} members without URLs`);

    // Filter to only members that have URLs in backup
    const matchedMembers = membersToUpdate.filter(member => urlMap.has(member._id));
    console.log(`${matchedMembers.length} members have URLs in backup`);

    if (matchedMembers.length === 0) {
      console.log('No members to migrate URLs for');
      return {
        success: true,
        message: 'No members need URL migration',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    // Create migration data with URLs
    const migrationData = matchedMembers.map(member => ({
      _id: member._id,
      url: urlMap.get(member._id),
    }));

    // Split into chunks of 10k members per task
    const chunks = chunkArray(migrationData, CHUNK_SIZE);
    console.log(`Scheduling ${chunks.length} tasks for URL migration`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const task = {
        name: TASKS_NAMES.migrateUrlsChunk,
        data: {
          members: chunk,
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
      message: `Scheduled ${chunks.length} tasks for ${matchedMembers.length} members`,
      totalMembers: matchedMembers.length,
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
 */
async function migrateUrlsChunk(data) {
  const { members, chunkIndex, totalChunks } = data;
  console.log(
    `Processing migration chunk ${chunkIndex + 1}/${totalChunks} (${members.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Use bulkSave to update all members at once (Wix supports up to 1000 per call)
    const bulkChunks = chunkArray(members, 1000);

    for (let i = 0; i < bulkChunks.length; i++) {
      const bulkChunk = bulkChunks[i];
      try {
        const bulkResult = await wixData.bulkSave(COLLECTION_LATEST, bulkChunk);
        result.successful += (bulkResult.inserted || 0) + (bulkResult.updated || 0);
        console.log(`✅ Bulk saved ${bulkResult.updated || 0} members in sub-chunk ${i + 1}`);

        // Small delay between bulk operations
        if (i < bulkChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      } catch (error) {
        console.error(`❌ Failed to bulk save sub-chunk ${i + 1}:`, error);
        result.failed += bulkChunk.length;
        result.errors.push({
          subChunk: i + 1,
          size: bulkChunk.length,
          error: error.message,
        });
      }
    }

    console.log(
      `Chunk ${chunkIndex + 1} complete: ${result.successful} success, ${result.failed} failed`
    );
    return result;
  } catch (error) {
    console.error(`Error processing migration chunk ${chunkIndex}:`, error);
    throw error;
  }
}

/**
 * Step 2: Schedule Phase 3 - Generate URLs for members without URLs
 * This function queries members that still don't have URLs and schedules generation tasks
 */
async function scheduleGenerateMissingUrls() {
  console.log('=== Scheduling Phase 3: Generate Missing URLs ===');

  try {
    // Query all members that still don't have URLs
    const membersToUpdate = await wixData
      .query(COLLECTION_LATEST)
      .isEmpty('url')
      .limit(1000)
      .find()
      .then(results => queryAllItems(results));

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

    // Split into chunks of 10k members per task
    const chunks = chunkArray(membersToUpdate, CHUNK_SIZE);
    console.log(`Scheduling ${chunks.length} tasks for URL generation`);

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
 */
async function generateUrlsChunk(data) {
  const { memberIds, chunkIndex, totalChunks } = data;
  console.log(
    `Processing generation chunk ${chunkIndex + 1}/${totalChunks} (${memberIds.length} members)`
  );

  const result = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Fetch member data for these IDs
    const members = await wixData
      .query(COLLECTION_LATEST)
      .hasSome('_id', memberIds)
      .limit(1000)
      .find()
      .then(results => queryAllItems(results));

    console.log(`Fetched ${members.length} members for URL generation`);

    // Generate URLs in smaller batches to avoid timeout
    const batches = chunkArray(members, BATCH_SIZE);
    const updatedMembers = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Generating URLs for batch ${i + 1}/${batches.length} (${batch.length} members)`);

      const results = await Promise.allSettled(
        batch.map(async member => {
          try {
            const name =
              member.fullName || `${member.firstName || ''} ${member.lastName || ''}`.trim();

            if (!name) {
              throw new Error(`Member ${member._id} has no name data`);
            }

            // Generate unique URL
            const uniqueUrl = await ensureUniqueUrl({
              url: '', // Empty URL triggers generation
              memberId: member._id,
              fullName: name,
            });

            console.log(`✅ Generated URL for member ${member._id}: ${uniqueUrl}`);
            return { ...member, url: uniqueUrl };
          } catch (error) {
            console.error(`❌ Failed to generate URL for member ${member._id}:`, error);
            throw error;
          }
        })
      );

      // Collect successful results
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          result.successful++;
          updatedMembers.push(res.value);
        } else {
          result.failed++;
          result.errors.push({
            memberId: batch[idx]._id,
            error: res.reason?.message || 'Unknown error',
          });
        }
      });

      // Small delay between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    // Bulk save all generated URLs (in chunks of 1000)
    console.log(`Bulk saving ${updatedMembers.length} members with generated URLs...`);
    const saveChunks = chunkArray(updatedMembers, 1000);
    let savedCount = 0;

    for (let i = 0; i < saveChunks.length; i++) {
      const chunk = saveChunks[i];
      try {
        const bulkResult = await wixData.bulkSave(COLLECTION_LATEST, chunk);
        savedCount += (bulkResult.inserted || 0) + (bulkResult.updated || 0);
        console.log(`Saved chunk ${i + 1}/${saveChunks.length} (${savedCount} total saved)`);

        if (i < saveChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      } catch (error) {
        console.error(`Failed to bulk save chunk ${i + 1}:`, error);
      }
    }

    console.log(
      `Chunk ${chunkIndex + 1} complete: ${result.successful} success, ${result.failed} failed`
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
