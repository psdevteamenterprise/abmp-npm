const { taskManager } = require('psdev-task-manager');

const { COLLECTIONS } = require('../../public/consts');
const { COMPILED_FILTERS_FIELDS, CONFIG_KEYS } = require('../consts');
const { wixData } = require('../elevated-modules');
const { updateWixMemberLoginEmail } = require('../members-area-methods');
const {
  getAllEmptyAboutYouMembers,
  getAllMembersWithExternalImages,
  getMembersWithWixUrl,
  getAllMembersWithoutContactFormEmail,
  findMemberByWixDataId,
  bulkSaveMembers,
  getAllUpdatedLoginEmails,
  getMembersByIds,
  createContactAndMemberIfNew,
  getAllMembersWithWixMemberId,
} = require('../members-data-methods');
const {
  getCompleteStateList,
  getAreasOfPracticeList,
  getStateCityMap,
  getCompiledFiltersOptions,
} = require('../search-filters-methods');
const { chunkArray, getSiteConfigs } = require('../utils');

const { TASKS_NAMES } = require('./consts');
const {
  updateMemberRichContent,
  updateMemberProfileImage,
  getAWSTokens,
  uploadMembersSitemap,
} = require('./tasks-helpers-methods');

const scheduleTaskForEmptyAboutYouMembers = async () => {
  const createTasksFromMembers = members => {
    const memberIds = members.map(member => member._id);
    return {
      name: TASKS_NAMES.convertHtmlToRichContent,
      data: { memberIds },
      type: 'scheduled',
    };
  };
  const members = await getAllEmptyAboutYouMembers();
  console.log('starting to schedule tasks for empty about you members');
  const membersChunks = chunkArray(members, 1000);
  for (const chunk of membersChunks) {
    const toScheduleTask = createTasksFromMembers(chunk);
    await taskManager().schedule(toScheduleTask);
  }
};

//this funciton takes ~0.5 seconds per member
const convertAboutYouHtmlToRichContent = async membersIds => {
  const result = {};

  // Process members in chunks of 30
  const chunks = chunkArray(membersIds, 30);

  for (const chunk of chunks) {
    console.log(`Processing chunk of ${chunk.length} members`);

    // Process each chunk concurrently using Promise.all
    const chunkPromises = chunk.map(async memberId => {
      console.log('memberId ======', memberId);
      try {
        await updateMemberRichContent(memberId);
        return { memberId, success: true };
      } catch (error) {
        console.error('error in updating member', error);
        return { memberId, success: false };
      }
    });

    // Wait for all promises in the chunk to complete
    const chunkResults = await Promise.all(chunkPromises);

    // Update result object with chunk results
    chunkResults.forEach(({ memberId, success }) => {
      result[memberId] = success;
    });
  }

  return result;
};

async function compileFiltersOptions(field) {
  const getNonCompiledFilter = field => {
    const filterMap = {
      [COMPILED_FILTERS_FIELDS.COMPILED_STATE_LIST]: getCompleteStateList,
      [COMPILED_FILTERS_FIELDS.COMPILED_AREAS_OF_PRACTICES]: getAreasOfPracticeList,
      [COMPILED_FILTERS_FIELDS.COMPILED_STATE_CITY_MAP]: getStateCityMap,
    };
    const filterFunction = filterMap[field];
    if (!filterFunction) {
      throw new Error(`Unknown filter field: ${field}`);
    }
    return filterFunction();
  };
  const [nonCompiledFilterData, compiledFiltersOptions] = await Promise.all([
    getNonCompiledFilter(field),
    getCompiledFiltersOptions(),
  ]);
  compiledFiltersOptions[field] = nonCompiledFilterData;
  await wixData.save(COLLECTIONS.COMPILED_STATE_CITY_MAP, compiledFiltersOptions);
}

const scheduleTaskForExternalProfileImages = async () => {
  const createImageMigrationTasksFromMembers = members => {
    const memberIds = members.map(member => member._id);

    return {
      name: TASKS_NAMES.convertExternalProfilesToWixImages,
      data: { memberIds },
      type: 'scheduled',
    };
  };
  const members = await getAllMembersWithExternalImages();
  console.log('Starting to schedule tasks for external profile image migration');
  const membersChunks = chunkArray(members, 300);
  for (const chunk of membersChunks) {
    const toScheduleTask = createImageMigrationTasksFromMembers(chunk);
    await taskManager().schedule(toScheduleTask);
  }
  console.log(`Scheduled ${members.length} members for profile image migration`);
};

const convertExternalProfilesToWixImages = async membersIds => {
  const result = {};

  // Process members in chunks of 30 (optimal concurrent processing)
  const chunks = chunkArray(membersIds, 30);

  for (const chunk of chunks) {
    console.log(`Processing profile image chunk of ${chunk.length} members`);

    // Process each chunk concurrently using Promise.all
    const chunkPromises = chunk.map(async memberId => {
      console.log('Processing profile image for member:', memberId);
      try {
        const updateResult = await updateMemberProfileImage(memberId);
        return {
          memberId,
          success: updateResult.success,
          message: updateResult.message,
        };
      } catch (error) {
        console.error('Error updating member profile image:', error);
        return { memberId, success: false, error: error.message };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);

    // Log results for this chunk
    chunkResults.forEach(result => {
      if (result.success) {
        console.log(`✅ Successfully processed profile image for member ${result.memberId}`);
      } else {
        console.error(
          `❌ Failed to process profile image for member ${result.memberId}: ${result.error}`
        );
      }
    });

    // Add small delay between chunks to avoid overwhelming the media manager
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return result;
};
const updateSiteMapS3 = async () => {
  const relevantMembers = await getMembersWithWixUrl();
  console.log('number of profiles to upload', relevantMembers.length);
  const [tokens, siteAssociation] = await Promise.all([
    getAWSTokens(),
    getSiteConfigs(CONFIG_KEYS.SITE_ASSOCIATION),
  ]);
  // const creds = await getNewStsSessionToken(tokens.AWS_ACCESS_KEY_ID, tokens.AWS_SECRET_ACCESS_KEY, 3600);
  // console.log("creds",creds); // verify it’s fresh
  try {
    const chunkSize = 50000;
    console.log('Total items will be split into', relevantMembers.length / chunkSize);
    const chunks = chunkArray(relevantMembers, chunkSize);
    console.log(`Uploading ${chunks.length} sitemap files...`);
    for (let i = 0; i < chunks.length; i++) {
      const index = i + 1;
      const fileName = `profiles-sitemap-${index}.xml`;
      console.log(
        `Uploading chunk ${index}/${chunks.length} -> ${fileName} (${chunks[i].length} items)`
      );
      await uploadMembersSitemap({
        members: chunks[i],
        tokens,
        destinationFileName: fileName,
        siteAssociation,
      });
      console.log(`Uploaded ${fileName}`);
    }
    console.log('All sitemap files uploaded successfully');
  } catch (e) {
    console.error('Sitemap upload failed:', e?.message || e);
  }
};

/**
 * Schedules tasks to migrate contactFormEmail for all members who don't have it set
 * This function gets all members missing contactFormEmail and schedules batch processing tasks
 */
const scheduleContactFormEmailMigration = async () => {
  try {
    console.log('Starting to schedule contactFormEmail migration tasks');
    const createContactFormEmailMigrationTask = (members, chunkIndex) => {
      const memberIds = members.map(member => member._id);
      return {
        name: TASKS_NAMES.migrateContactFormEmails,
        data: { memberIds, chunkIndex },
        type: 'scheduled',
      };
    };
    const membersToMigrate = await getAllMembersWithoutContactFormEmail();
    console.log(`Found ${membersToMigrate.length} members needing contactFormEmail migration`);
    if (membersToMigrate.length === 0) {
      console.log('No members need contactFormEmail migration');
      return {
        success: true,
        message: 'No members need migration',
        totalMembers: 0,
        tasksScheduled: 0,
      };
    }

    // Process in chunks of 500 members per task (smaller chunks for reliability)
    const membersChunks = chunkArray(membersToMigrate, 500);
    console.log(`Creating ${membersChunks.length} migration tasks`);

    for (let chunkIndex = 0; chunkIndex < membersChunks.length; chunkIndex++) {
      const chunk = membersChunks[chunkIndex];
      const migrationTask = createContactFormEmailMigrationTask(chunk, chunkIndex);
      await taskManager().schedule(migrationTask);
      console.log(`Scheduled task for chunk ${chunkIndex} with ${chunk.length} members`);
    }

    console.log(
      `Successfully scheduled ${membersChunks.length} tasks for ${membersToMigrate.length} members`
    );

    return {
      success: true,
      message: `Scheduled ${membersChunks.length} tasks for ${membersToMigrate.length} members`,
      totalMembers: membersToMigrate.length,
      tasksScheduled: membersChunks.length,
    };
  } catch (error) {
    const errorMessage = `Failed to schedule contactFormEmail migration: ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};

/**
 * Migrates contactFormEmail for a batch of members
 * Sets contactFormEmail to the same value as the member's current email
 * @param {Object} data - Data object with memberIds and chunkIndex
 * @param {Array} data.memberIds - Array of member IDs to process
 * @param {number} data.chunkIndex - Index of the chunk
 * @returns {Promise<Object>} - Result object with success/failure counts
 */
const migrateContactFormEmails = async data => {
  const { memberIds, chunkIndex } = data;
  const result = {
    successful: 0,
    failed: 0,
    errors: [],
    skipped: 0,
    skippedIds: [],
  };

  console.log(
    `Starting contactFormEmail migration for ${memberIds.length} members in chunk ${chunkIndex}`
  );

  try {
    // Get all members for this batch
    const memberPromises = memberIds.map(async memberId => {
      try {
        const member = await findMemberByWixDataId(memberId);

        // Skip if member already has contactFormEmail set
        if (member.contactFormEmail) {
          console.log(`Member ${memberId} already has contactFormEmail set`);
          result.skipped++;
          result.skippedIds.push(memberId);
          return null;
        }

        // Skip if member doesn't have email
        if (!member.email) {
          console.log(`Member ${memberId} doesn't have email - skipping`);
          result.skipped++;
          result.skippedIds.push(memberId);
          return null;
        }

        return {
          ...member,
          contactFormEmail: member.email,
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
      `Started Updating ${membersToUpdate.length} members with contactFormEmail in chunk ${chunkIndex}`
    );

    // Process in smaller chunks for bulk update (1000 is Wix limit)
    const updateChunks = chunkArray(membersToUpdate, 1000);

    for (let chunkIndex = 0; chunkIndex < updateChunks.length; chunkIndex++) {
      const chunk = updateChunks[chunkIndex];
      try {
        await bulkSaveMembers(chunk);
        result.successful += chunk.length;
        console.log(`✅ Successfully updated ${chunk.length} members in chunk ${chunkIndex}`);
      } catch (error) {
        console.error(`❌ Error updating chunk ${chunkIndex}:`, error);
        result.failed += chunk.length;
        result.errors.push({
          chunk: chunkIndex,
          error: error.message,
          memberCount: chunk.length,
        });
      }
    }
  } catch (error) {
    const errorMessage = `Failed to migrate contactFormEmail for chunk ${chunkIndex}: ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  console.log(
    `ContactFormEmail migration task completed: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped, in chunk ${chunkIndex}`
  );
  return result;
};

/**
Schedules tasks to sync updated emails from the updated login emails database
 * This function gets all updated emails and schedules batch processing tasks
 */
const scheduleEmailSync = async () => {
  try {
    console.log('Starting to schedule email sync tasks');
    const createEmailSyncTask = (chunk, chunkIndex) => {
      //To reduce stored Items size inside task data
      const emailUpdates = chunk.map(emailUpdate => ({
        memberId: emailUpdate.memberId,
        loginEmail: emailUpdate.loginEmail,
      }));
      return {
        name: TASKS_NAMES.syncMemberLoginEmails,
        data: { emailUpdates, chunkIndex },
        type: 'scheduled',
      };
    };
    const updatedEmails = await getAllUpdatedLoginEmails();
    console.log(`Found ${updatedEmails.length} updated email records`);

    if (updatedEmails.length === 0) {
      console.log('No updated emails found');
      return {
        success: true,
        message: 'No updated emails to sync',
        totalEmails: 0,
        tasksScheduled: 0,
      };
    }

    const emailChunks = chunkArray(updatedEmails, 500);
    console.log(`Creating ${emailChunks.length} email sync tasks`);

    for (let chunkIndex = 0; chunkIndex < emailChunks.length; chunkIndex++) {
      const chunk = emailChunks[chunkIndex];
      const syncTask = createEmailSyncTask(chunk, chunkIndex);
      await taskManager().schedule(syncTask);
      console.log(`Scheduled task for chunk ${chunkIndex} with ${chunk.length} email updates`);
    }

    console.log(
      `Successfully scheduled ${emailChunks.length} tasks for ${updatedEmails.length} email updates`
    );

    return {
      success: true,
      message: `Scheduled ${emailChunks.length} tasks for ${updatedEmails.length} email updates`,
      totalEmails: updatedEmails.length,
      tasksScheduled: emailChunks.length,
    };
  } catch (error) {
    const errorMessage = `Failed to schedule email sync: ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};

/**
 * Syncs member emails with updated login emails
 * @param {Object} data - Data object with emailUpdates and chunkIndex
 * @param {Array} data.emailUpdates - Array of email update objects with memberId and loginEmail
 * @param {number} data.chunkIndex - Index of the chunk
 * @returns {Object} - Result object with success/failure counts
 */
const syncMemberLoginEmails = async data => {
  const { emailUpdates, chunkIndex } = data;
  const result = {
    successful: 0,
    failed: 0,
    skipped: 0,
    skippedIds: [],
    missingMemberIds: [],
    errors: [],
  };

  console.log(
    `Starting email sync for ${emailUpdates.length} email updates in chunk ${chunkIndex}`
  );

  try {
    const memberIds = emailUpdates.map(update => update.memberId);

    const existingMembers = await getMembersByIds(memberIds);
    console.log(`Found ${existingMembers.length} existing members to update`);
    const existingMemberIds = new Set(existingMembers.map(member => member.memberId));
    const missingMemberIds = memberIds.filter(memberId => !existingMemberIds.has(memberId));

    // Add missing member IDs to skipped count and log them
    if (missingMemberIds.length > 0) {
      console.log(
        `Found ${missingMemberIds.length} members in emailUpdates but not in database:`,
        missingMemberIds
      );
      result.missingMemberIds = result.missingMemberIds || [];
      result.missingMemberIds.push(...missingMemberIds);
    }
    const emailUpdateMap = new Map();
    emailUpdates.forEach(update => {
      emailUpdateMap.set(update.memberId, update.loginEmail);
    });

    const membersToUpdate = [];

    for (const member of existingMembers) {
      const newEmail = emailUpdateMap.get(member.memberId);

      if (!newEmail) {
        console.log(`No email update found for member ${member.memberId}`);
        result.skipped++;
        result.skippedIds.push(member.memberId);
        continue;
      }

      if (member.email === newEmail) {
        console.log(`Email already up to date for member ${member.memberId}`);
        result.skipped++;
        result.skippedIds.push(member.memberId);
        continue;
      }

      membersToUpdate.push({
        ...member,
        email: newEmail,
      });
    }

    if (membersToUpdate.length === 0) {
      console.log('No members need email updates in this batch', chunkIndex);
      return result;
    }

    console.log(
      `Updating ${membersToUpdate.length} members with new emails in chunk ${chunkIndex}`
    );

    const updateChunks = chunkArray(membersToUpdate, 1000);

    for (const chunk of updateChunks) {
      try {
        await bulkSaveMembers(chunk);

        for (const member of chunk) {
          await updateWixMemberLoginEmail(member, result);
        }

        result.successful += chunk.length;
        console.log(`✅ Successfully updated ${chunkIndex} ${chunk.length} members`);
      } catch (error) {
        console.error(`❌ Error updating chunk ${chunkIndex}:`, error);
        result.failed += chunk.length;
        result.errors.push({
          chunk: chunkIndex,
          error: error.message,
          memberCount: chunk.length,
        });
      }
    }
    // Log comprehensive results including Wix member updates
    const wixStats = result.wixMemberUpdates || { successful: 0, failed: 0 };
    console.log(`Login Emails sync task completed:`);
    console.log(
      `  - Member data updates: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped`
    );
    console.log(
      `  - Wix member login emails: ${wixStats.successful} successful, ${wixStats.failed} failed`
    );

    return result;
  } catch (error) {
    const errorMessage = `Failed to syncMemberLoginEmails for chunk ${chunkIndex} of length ${emailUpdates.length} with error: ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};
/**
 * Schedules tasks to create contacts from members
 * dev-only task, run only once by the developers
 */
const scheduleCreateContactsFromMembers = async () => {
  const members = await getAllMembersWithWixMemberId();
  console.log(
    `Starting to schedule create contacts from members tasks for ${members.length} members in chunks of 500 members`
  );
  const membersChunks = chunkArray(members, 500);
  for (let chunkIndex = 0; chunkIndex < membersChunks.length; chunkIndex++) {
    const chunk = membersChunks[chunkIndex];
    const toScheduleTask = {
      name: TASKS_NAMES.createContactsFromMembers,
      data: { chunk, chunkIndex },
      type: 'scheduled',
    };
    await taskManager().schedule(toScheduleTask);
    console.log(`Scheduled task for chunk ${chunkIndex} with ${chunk.length} members`);
  }
  console.log(`Successfully scheduled ${membersChunks.length} tasks for ${members.length} members`);
};

/**
 * Creates contacts from members
 * dev-only task, run only once by the developers
 */
const createContactsFromMembers = async data => {
  const { chunk, chunkIndex } = data;
  console.log(`Creating contacts from ${chunk.length} members in chunk ${chunkIndex}`);
  const createPromises = chunk.map(member => createContactAndMemberIfNew(member, true));
  const createResults = await Promise.all(createPromises);
  console.log(
    `Created ${createResults.length} contacts from ${chunk.length} members in chunk ${chunkIndex}`
  );
  const saveResult = await bulkSaveMembers(createResults);
  console.log(
    `Successfully saved ${saveResult.totalSaved} contacts from ${chunk.length} members in chunk ${chunkIndex}`
  );
  return saveResult;
};

module.exports = {
  scheduleTaskForEmptyAboutYouMembers,
  convertAboutYouHtmlToRichContent,
  compileFiltersOptions,
  scheduleTaskForExternalProfileImages,
  convertExternalProfilesToWixImages,
  updateSiteMapS3,
  scheduleContactFormEmailMigration,
  migrateContactFormEmails,
  scheduleEmailSync,
  syncMemberLoginEmails,
  scheduleCreateContactsFromMembers, // run only once by the developers
  createContactsFromMembers,
};
