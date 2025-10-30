const { taskManager } = require('psdev-task-manager');

const { TASKS_NAMES } = require('../consts');
const { getMembers } = require('../pac-api-methods');

const { bulkProcessAndSaveMemberData } = require('./bulk-process-methods');
const { isUpdatedMember, isABMPMember } = require('./utils');

async function syncMembersDataPerAction(action) {
  try {
    const firstPageResponse = await getMembers(1, action);

    if (
      !firstPageResponse ||
      !firstPageResponse.results ||
      firstPageResponse.results.length === 0
    ) {
      return {
        success: true,
        totalPagesProcessed: 0,
        lastPageProcessed: 0,
        completedAt: new Date().toISOString(),
        message: 'No data found',
      };
    }

    // Calculate total pages from API response
    const totalResults = firstPageResponse.total_results || 0;
    const perPage = firstPageResponse.results.length;
    const totalPages = firstPageResponse.total_pages || 0;

    // Cap at 1000 pages as safety measure
    const pagesToProcess = Math.min(totalPages, 1000);

    console.log(
      `Scheduling ${pagesToProcess} pages for processing (${totalResults} total records, ${perPage} per page)`
    );

    // Schedule tasks for all pages at once
    const toScheduleTasks = Array.from(
      { length: pagesToProcess },
      (_, i) => i + 1 // API expects page number to start from 1
    ).map(pageNumber => ({
      name: TASKS_NAMES.SyncMembers,
      data: {
        pageNumber,
        action,
      },
      type: 'scheduled',
    }));

    // Wait for all scheduling to complete
    await taskManager().scheduleInBulk(toScheduleTasks);

    return {
      success: true,
      totalPagesProcessed: pagesToProcess,
      lastPageProcessed: pagesToProcess,
      totalRecords: totalResults,
      recordsPerPage: perPage,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Synchronization failed: ${error.message}`);
  }
}

/**
 * Synchronizes a single page of member data
 * @param {Object} taskObject - Task object containing page data
 * @returns {Promise<Object>} - Page synchronization result
 */
async function synchronizeSinglePage(taskObject) {
  const { pageNumber, action } = taskObject.data;
  try {
    const memberDataResponse = await getMembers(pageNumber, action);

    if (
      !memberDataResponse ||
      !memberDataResponse.results ||
      memberDataResponse.results.length === 0
    ) {
      throw new Error(`No data found for page ${pageNumber}`);
    }
    const toSyncMembers = memberDataResponse.results.filter(
      member => isUpdatedMember(member) && isABMPMember(member)
    );
    if (toSyncMembers.length === 0) {
      return {
        success: true,
        pageNumber,
        totalPageSize: memberDataResponse.results.length,
        filteredPageSize: toSyncMembers.length,
        message: 'No to be updated, or ABMP members found',
      };
    }
    const result = await bulkProcessAndSaveMemberData(toSyncMembers, pageNumber);

    return {
      success: true,
      pageNumber,
      totalPageSize: memberDataResponse.results.length,
      filteredPageSize: toSyncMembers.length,
      ...result,
    };
  } catch (error) {
    throw new Error(`Page ${pageNumber} synchronization failed: ${error.message}`);
  }
}

module.exports = {
  syncMembersDataPerAction,
  synchronizeSinglePage,
};
