// One-off first import of a PAC association's members into a new site's MembersDataLatest.
// See .claude/skills/pac-site-member-import/SKILL.md for when and how to run each step.
//
//   node dev-only-scripts/member-import <command> --site <siteId> --out <dir> [flags]
//
//   fetch            download PAC MigrateMembers to <out>/pac-feed.json (needs PAC_MIGRATOR_API_KEY)
//   build            read SITE_ASSOCIATION from the site, write <out>/rows.json + report.json
//   import           insert <out>/rows.json in batches of 1000 (dry run unless --yes)
//   verify           read the collection back and compare it with <out>/rows.json

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { COLLECTIONS } = require('../../public/consts');

const { buildImport } = require('./transform');

const PAC_MIGRATE_URL = 'https://members.ascpskincare.com/eweb/api/Wix/MigrateMembers';
const WIX_API = 'https://www.wixapis.com/wix-data/v2';
const BATCH_SIZE = 1000;

const parseArgs = argv => {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue;
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    flags[key] = next && !next.startsWith('--') ? (i++, next) : true;
  }
  return { command, flags };
};

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// --- Wix Data REST, authenticated with the CLI's site-scoped token -------------------------

let cachedToken = null;
const getToken = siteId => {
  if (cachedToken) return cachedToken;
  const output = execFileSync('wix', ['token', '-s', siteId], { encoding: 'utf8' });
  const match = output.match(/OauthNG[A-Za-z0-9._-]*/);
  if (!match) throw new Error(`wix token -s ${siteId} returned no token`);
  cachedToken = match[0];
  return cachedToken;
};

const wixPost = async (siteId, endpoint, body) => {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${WIX_API}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: getToken(siteId), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);
    // 429/5xx are worth a retry; anything else is a request we got wrong.
    if (attempt >= 4 || (response.status !== 429 && response.status < 500)) {
      throw new Error(`${endpoint} -> ${response.status}: ${text.slice(0, 500)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
  }
};

const countItems = async (siteId, collection) =>
  (await wixPost(siteId, '/items/count', { dataCollectionId: collection })).totalCount;

const getSiteAssociation = async siteId => {
  const { dataItems } = await wixPost(siteId, '/items/query', {
    dataCollectionId: COLLECTIONS.SITE_CONFIGS,
    query: { paging: { limit: 1 } },
  });
  return dataItems?.[0]?.data?.SITE_ASSOCIATION || null;
};

const queryAll = async (siteId, collection, fields) => {
  const items = [];
  let cursor = null;
  do {
    const { dataItems, pagingMetadata } = await wixPost(siteId, '/items/query', {
      dataCollectionId: collection,
      query: { cursorPaging: { limit: BATCH_SIZE, ...(cursor ? { cursor } : {}) } },
      ...(fields ? { fields } : {}),
    });
    items.push(...dataItems.map(item => item.data));
    cursor = pagingMetadata?.cursors?.next;
  } while (cursor);
  return items;
};

// --- commands --------------------------------------------------------------------------------

async function fetchFeed({ out }) {
  const key = process.env.PAC_MIGRATOR_API_KEY;
  if (!key) throw new Error('PAC_MIGRATOR_API_KEY is not set');
  console.log(`GET ${PAC_MIGRATE_URL} (~130MB, ~20s)`);
  const response = await fetch(PAC_MIGRATE_URL, { headers: { Authorization: `Bearer ${key}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`MigrateMembers -> ${response.status}: ${text.slice(0, 300)}`);
  const feed = JSON.parse(text);
  fs.writeFileSync(path.join(out, 'pac-feed.json'), text);
  console.log(
    `saved ${feed.results.length} members (feed says total_results ${feed.total_results})`
  );
}

async function build({ site, out, association: expected }) {
  const association = await getSiteAssociation(site);
  if (!association) throw new Error('SiteConfigs has no SITE_ASSOCIATION');
  if (expected && expected !== association) {
    throw new Error(`site says SITE_ASSOCIATION=${association}, --association says ${expected}`);
  }
  const existingUrls = (await queryAll(site, COLLECTIONS.MEMBERS_DATA, ['url'])).map(m => m.url);
  const { results } = readJson(path.join(out, 'pac-feed.json'));
  const { rows, rejected, report } = buildImport(results, { association, existingUrls });
  report.existingRowsOnSite = existingUrls.length;
  writeJson(path.join(out, 'rows.json'), rows);
  writeJson(path.join(out, 'rejected.json'), rejected);
  writeJson(path.join(out, 'report.json'), report);
  console.log(JSON.stringify(report, null, 2));
}

async function importRows({ site, out, yes, 'allow-nonempty': allowNonEmpty }) {
  const rows = readJson(path.join(out, 'rows.json'));
  const report = readJson(path.join(out, 'report.json'));
  const association = await getSiteAssociation(site);
  if (association !== report.association) {
    throw new Error(`rows were built for ${report.association}, site is now ${association}`);
  }
  const existing = await countItems(site, COLLECTIONS.MEMBERS_DATA);
  if (existing > 0 && !allowNonEmpty) {
    throw new Error(`${COLLECTIONS.MEMBERS_DATA} already has ${existing} rows; refusing`);
  }
  const batches = Math.ceil(rows.length / BATCH_SIZE);
  console.log(`${association}: ${rows.length} rows in ${batches} batches, ${existing} on site now`);
  if (!yes) {
    console.log('dry run - pass --yes to insert');
    return;
  }

  const log = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNumber = i / BATCH_SIZE + 1;
    const { bulkActionMetadata, results } = await wixPost(site, '/bulk/items/insert', {
      dataCollectionId: COLLECTIONS.MEMBERS_DATA,
      dataItems: batch.map(data => ({ data })),
    });
    const failures = (results || [])
      .filter(result => !result.itemMetadata?.success)
      .map(result => ({
        memberId: batch[result.itemMetadata?.originalIndex]?.memberId,
        error: result.itemMetadata?.error,
      }));
    log.push({ batch: batchNumber, ...bulkActionMetadata, failures });
    console.log(
      `batch ${batchNumber}/${batches}: ${bulkActionMetadata.totalSuccesses} ok, ${bulkActionMetadata.totalFailures} failed`
    );
    writeJson(path.join(out, 'import-log.json'), log);
  }
}

// Wix stores object keys in its own order and writes dates without milliseconds, so compare
// values: keys sorted, {$date} reduced to epoch milliseconds.
const canonical = value =>
  JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      if (typeof inner.$date === 'string') return { $date: Date.parse(inner.$date) };
      return Object.fromEntries(
        Object.keys(inner)
          .sort()
          .map(key => [key, inner[key]])
      );
    }
    return inner;
  });

async function verify({ site, out }) {
  const rows = readJson(path.join(out, 'rows.json'));
  const live = await queryAll(site, COLLECTIONS.MEMBERS_DATA);
  const liveById = new Map(live.map(member => [String(member.memberId), member]));

  const missing = rows.filter(row => !liveById.has(String(row.memberId))).map(r => r.memberId);
  const expectedIds = new Set(rows.map(row => String(row.memberId)));
  const unexpected = live.filter(m => !expectedIds.has(String(m.memberId))).map(m => m.memberId);
  const duplicateIds = live.length - liveById.size;
  const slugs = live.map(member => (member.url || '').toLowerCase());
  const duplicateSlugs = slugs.length - new Set(slugs).size;

  // Field-by-field on every row: Wix may add system fields, but must not change ours.
  const mismatched = [];
  rows.forEach(row => {
    const stored = liveById.get(String(row.memberId));
    if (!stored) return;
    const fields = Object.keys(row).filter(key => canonical(row[key]) !== canonical(stored[key]));
    if (fields.length) mismatched.push({ memberId: row.memberId, fields });
  });

  const result = {
    expected: rows.length,
    onSite: live.length,
    missing,
    unexpected,
    duplicateIds,
    duplicateSlugs,
    mismatched: mismatched.length,
    mismatchedSample: mismatched.slice(0, 10),
  };
  writeJson(path.join(out, 'verify.json'), result);
  console.log(
    JSON.stringify({ ...result, missing: missing.length, unexpected: unexpected.length }, null, 2)
  );
  const ok =
    !missing.length && !unexpected.length && !duplicateIds && !duplicateSlugs && !mismatched.length;
  console.log(ok ? 'VERIFIED' : 'NOT VERIFIED - see verify.json');
  if (!ok) process.exitCode = 1;
}

const COMMANDS = {
  fetch: fetchFeed,
  build,
  import: importRows,
  verify,
};

(async () => {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const run = COMMANDS[command];
  if (!run) {
    console.error(
      `usage: node dev-only-scripts/member-import <${Object.keys(COMMANDS).join('|')}> --site <siteId> --out <dir>`
    );
    process.exit(1);
  }
  if (!flags.out) throw new Error('--out <dir> is required');
  if (command !== 'fetch' && !flags.site) {
    throw new Error('--site <siteId> is required');
  }
  fs.mkdirSync(flags.out, { recursive: true });
  await run(flags);
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
