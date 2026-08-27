const { taskManager } = require('psdev-task-manager');

const {
  resolveAssociationExpiration,
  ASSOCIATION_EXPIRATION_FIELD,
} = require('../association-expiry');
const { CONFIG_KEYS } = require('../consts');
const { fetchPACMembers } = require('../pac-api-methods');
const { TASKS_NAMES } = require('../tasks/consts');
const { getSiteConfigs } = require('../utils');

const { bulkProcessAndSaveMemberData } = require('./bulk-process-methods');
const { MEMBER_ACTIONS } = require('./consts');
const { isUpdatedMember, isSiteAssociatedMember } = require('./utils');

const filterLicensesByAssociation = (member, siteAssociation) => {
  if (!member?.licenses || !Array.isArray(member.licenses)) {
    return member;
  }
  const filteredLicenses = member.licenses.filter(license => {
    if (!license || !license.association) {
      return true;
    }
    return license.association === siteAssociation;
  });
  return {
    ...member,
    licenses: filteredLicenses,
  };
};

async function syncMembersDataPerAction(taskData) {
  const { action, backupDate, isTestEnvironment, includeNone } = taskData;
  try {
    const firstPageResponse = await fetchPACMembers({
      page: 1,
      action,
      backupDate,
      isTestEnvironment,
    });

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
        ...(backupDate ? { backupDate } : {}),
        ...(isTestEnvironment ? { isTestEnvironment } : {}),
        ...(includeNone ? { includeNone } : {}),
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
  const { pageNumber, action, backupDate, isTestEnvironment, includeNone } = taskObject.data;
  try {
    const [siteAssociation, memberDataResponse] = await Promise.all([
      getSiteConfigs(CONFIG_KEYS.SITE_ASSOCIATION),
      fetchPACMembers({
        page: pageNumber,
        action,
        backupDate,
        isTestEnvironment,
      }),
    ]);
    if (
      !memberDataResponse ||
      !memberDataResponse.results ||
      memberDataResponse.results.length === 0
    ) {
      throw new Error(`No data found for page ${pageNumber}`);
    }
    const toSyncMembers = memberDataResponse.results.filter(member => {
      if (!isSiteAssociatedMember(member, siteAssociation)) {
        return false;
      }
      if (action === MEMBER_ACTIONS.NONE && includeNone) {
        return true;
      }
      return isUpdatedMember(member);
    });
    // Narrow each member to this site's association: licenses filtered to it, and its expiration
    // lifted out of the memberships array into a scalar the directory query can filter on.
    const toSyncMembersWithFilteredLicenses = toSyncMembers.map(member => ({
      ...filterLicensesByAssociation(member, siteAssociation),
      [ASSOCIATION_EXPIRATION_FIELD]: resolveAssociationExpiration(member, siteAssociation),
    }));
    if (toSyncMembers.length === 0) {
      return {
        success: true,
        pageNumber,
        totalPageSize: memberDataResponse.results.length,
        filteredPageSize: toSyncMembers.length,
        message: `No to be updated, or members of association: '${siteAssociation}' found`,
      };
    }
    const result = await bulkProcessAndSaveMemberData({
      memberDataList: toSyncMembersWithFilteredLicenses,
      currentPageNumber: pageNumber,
    });

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
