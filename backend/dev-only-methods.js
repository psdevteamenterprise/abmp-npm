const { COLLECTIONS } = require('../public/consts');

const { ensureUniqueUrlsInBatch } = require('./daily-pull/bulk-process-methods');
const { ensureUniqueUrl } = require('./daily-pull/process-member-methods');
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

async function copyContactIdToWixMemberId() {
  const query = wixData.query(COLLECTIONS.MEMBERS_DATA).isNotEmpty('contactId');
  const members = await queryAllItems(query);
  const updatedMembers = members.map(member => ({
    ...member,
    wixMemberId: member.contactId,
  }));
  return await bulkSaveMembers(updatedMembers, COLLECTIONS.MEMBERS_DATA);
}

async function createMissingUrls() {
  const query = wixData.query(COLLECTIONS.MEMBERS_DATA).isEmpty('url');
  const members = await queryAllItems(query);
  console.log(
    'membersWithoutUrls info',
    JSON.stringify({
      count: members.length,
      membersIds: members.map(m => m.memberId),
    })
  );

  const membersWithGeneratedUrlsPromises = members.map(async member => ({
    ...member,
    url: await ensureUniqueUrl({
      url: member.url,
      memberId: member.memberId,
      fullName: member.fullName,
    }),
  }));
  const membersWithGeneratedUrls = await Promise.all(membersWithGeneratedUrlsPromises);
  //recheck urls in same batch to avoid duplicates
  const uniqueUrlsUpdatedMembers = await ensureUniqueUrlsInBatch(membersWithGeneratedUrls);
  const urls = uniqueUrlsUpdatedMembers.map(m => m.url).filter(Boolean);
  console.log('unique urls', [...new Set(urls)]);
  return await bulkSaveMembers(uniqueUrlsUpdatedMembers, COLLECTIONS.MEMBERS_DATA);
}

module.exports = { deduplicateURls, copyContactIdToWixMemberId, createMissingUrls };
