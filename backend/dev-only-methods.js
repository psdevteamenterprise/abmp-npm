const { ensureUniqueUrlsInBatch } = require('./daily-pull/bulk-process-methods');
const { wixData } = require('./elevated-modules');
const { bulkSaveMembers } = require('./members-data-methods');
const { queryAllItems } = require('./utils');

async function deduplicateURls(collectionName, duplicateUrlsList) {
  const query = await wixData.query(collectionName).hasSome('url', duplicateUrlsList).limit(1000);
  const membersWithSameUrl = await queryAllItems(query);

  console.log({ membersWithSameUrl });
  const membersWithUniqueUrls = await ensureUniqueUrlsInBatch(membersWithSameUrl);
  console.log({ membersWithUniqueUrls });
  const deduplicatedUrls = membersWithUniqueUrls.map(m => m.url);
  console.log({ deduplicatedUrls });
  return await bulkSaveMembers(membersWithUniqueUrls, collectionName);
}

module.exports = { deduplicateURls };
