const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  ASSOCIATION_EXPIRATION_FIELD,
  resolveAssociationExpiration,
} = require('../backend/association-expiry');

/**
 * One-off repair: bring `memberships`, `licenses` and `associationExpiration` back in line with
 * PAC's current feed for members whose daily update was lost.
 *
 * Background (PAC ticket 13031107600, Sept 2026): when a SyncMembers page fails it is never
 * retried, and PAC's update feed is a daily delta, so that day's changes are gone. Harmless until
 * 2.0.83 gated search, profile and SSO login on associationExpiration — since then a stale stored
 * expiration hides a member who is current at PAC.
 *
 * What it writes: exactly the three data fields the daily sync would have written for an existing
 * member (see createCoreMemberData): memberships as PAC sends them, licenses filtered to the site's
 * association, and the expiration derived from memberships with the shared rule. Nothing else —
 * no action, no pageNumber, no isVisible, no member-entered content. Writes go through Bulk Patch,
 * which touches only the named fields, so a member saving their form at the same moment is not
 * overwritten.
 *
 * Who it selects: visible, not opted out, not dropped rows whose stored memberships or expiration
 * differ from the feed (licenses are written too, but a licenses-only difference is format drift
 * and does not select a row). PAC STAFF are reported but skipped unless --include-staff: their "expiration" is the date
 * of the feed, so patching them buys a day; the staff gate needs its own fix.
 *
 * Default is a DRY RUN. Nothing is written without --apply.
 *
 * Usage:
 *   node dev-only-scripts/reconcile-memberships-with-pac.js --site ascp
 *   node dev-only-scripts/reconcile-memberships-with-pac.js --site ascp --member-id 948664 --apply
 *   node dev-only-scripts/reconcile-memberships-with-pac.js --site ascp --apply
 *
 * Options:
 *   --site <abmp|ascp|ahp|test-abmp|test-ascp|test-ahp>   required
 *   --apply            write the patches (default: report only)
 *   --member-id <id>   restrict to one member (use this for the first live check)
 *   --limit <n>        patch at most n rows
 *   --include-staff    also patch PAC STAFF rows
 *   --scope lost|all   lost (default): only rows whose expiration moves LATER or whose membership
 *                      type/association set changed — the lost-update cases. all: every row that
 *                      differs from the feed, including one-day-earlier expiration offsets.
 *   --feed-dir <dir>   reuse previously downloaded feed pages instead of fetching
 *
 * Auth: the site token comes from `wix token -s <siteId>` (override with WIX_TOKEN). The PAC key
 * is read from the site's Secrets Manager (`members-data-api-key`), never from the command line.
 * A JSON report with the before/after of every candidate is written to ./reconcile-reports/.
 */

const SITES = {
  abmp: { siteId: '384d680a-2870-4086-bda0-9894ce4503b8', association: 'ABMP' },
  ascp: { siteId: '1cb02bba-3a36-45e0-bdb4-1a1a2cfe2fdc', association: 'ASCP' },
  ahp: { siteId: '5553798e-c71e-4a58-9b9e-515803823429', association: 'AHP' },
  'test-abmp': { siteId: 'cd9fca47-63d3-4538-b26c-1f91ad0a9420', association: 'ABMP' },
  'test-ascp': { siteId: '8c031731-3f58-4d5f-b7dc-6ccabd1b5722', association: 'ASCP' },
  'test-ahp': { siteId: '4535a35f-439d-4558-8e68-9000258e2a2a', association: 'AHP' },
};
const COLLECTION = 'MembersDataLatest';
const PAC_API_URL = 'https://members.abmp.com/eweb/api/Wix';
const PAC_SECRET_NAME = 'members-data-api-key';
const WIX_DATA = 'https://www.wixapis.com/wix-data/v2';
const FEED_ACTIONS = ['none', 'update', 'new'];
const PATCH_BATCH = 100;
const PAC_STAFF = 'PAC STAFF';

const parseArgs = argv => {
  const args = { apply: false, includeStaff: false, scope: 'lost' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--include-staff') args.includeStaff = true;
    else if (a === '--site') args.site = argv[++i];
    else if (a === '--member-id') args.memberId = String(argv[++i]);
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--feed-dir') args.feedDir = argv[++i];
    else if (a === '--scope') args.scope = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!['lost', 'all'].includes(args.scope)) throw new Error('--scope must be lost or all');
  if (!args.site || !SITES[args.site]) {
    throw new Error(`--site must be one of: ${Object.keys(SITES).join(', ')}`);
  }
  return args;
};

const getSiteToken = siteId => {
  if (process.env.WIX_TOKEN) return process.env.WIX_TOKEN;
  const out = execSync(`wix token -s ${siteId}`, { encoding: 'utf8' });
  const match = out.match(/OauthNG\.JWS\.[A-Za-z0-9._-]+/);
  if (!match) throw new Error('Could not read a site token from `wix token`; set WIX_TOKEN');
  return match[0];
};

const wixJson = async (token, url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: token, 'Content-Type': 'application/json', ...options.headers },
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `${options.method || 'GET'} ${url} -> ${response.status} ${text.slice(0, 300)}`
    );
  return text ? JSON.parse(text) : {};
};

const getPacKey = async token => {
  const { value } = await wixJson(
    token,
    `https://www.wixapis.com/_api/cloud-secrets-vault-server/api/v1/secrets/name/${PAC_SECRET_NAME}`
  );
  if (!value) throw new Error(`Secret ${PAC_SECRET_NAME} is empty`);
  return value;
};

const fetchFeedPage = async (pacKey, action, page) => {
  const url = `${PAC_API_URL}/Members?page=${page}&actionFilter=${action}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${pacKey}` } });
  if (!response.ok) throw new Error(`PAC ${action} page ${page} -> ${response.status}`);
  return response.json();
};

/** Every member PAC currently lists, keyed by memberid. Reads only; nothing is written to PAC. */
const loadFeed = async (pacKey, feedDir) => {
  const feed = new Map();
  for (const action of FEED_ACTIONS) {
    let page = 1;
    let totalPages = 1;
    do {
      const cacheFile = feedDir && path.join(feedDir, `${action}-p${page}.json`);
      let data;
      if (cacheFile && fs.existsSync(cacheFile)) {
        data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } else {
        data = await fetchFeedPage(pacKey, action, page);
        if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(data));
      }
      totalPages = data.total_pages || 1;
      (data.results || []).forEach(member => feed.set(String(member.memberid), member));
      process.stdout.write(`  feed ${action} page ${page}/${totalPages}\r`);
      page += 1;
    } while (page <= totalPages);
    console.log('');
  }
  return feed;
};

/** Every row of the collection with the fields we compare. */
const loadCollection = async token => {
  const rows = [];
  let body = {
    dataCollectionId: COLLECTION,
    query: {
      fields: [
        'memberId',
        'fullName',
        'isVisible',
        'optOut',
        'action',
        'wixMemberId',
        'memberships',
        'licenses',
        ASSOCIATION_EXPIRATION_FIELD,
      ],
      cursorPaging: { limit: 1000 },
    },
  };
  for (;;) {
    const data = await wixJson(token, `${WIX_DATA}/items/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    (data.dataItems || []).forEach(item => rows.push({ _id: item.id, ...item.data }));
    process.stdout.write(`  collection rows ${rows.length}\r`);
    const cursor = data.pagingMetadata?.cursors?.next;
    if (!cursor) break;
    body = { dataCollectionId: COLLECTION, query: { cursorPaging: { limit: 1000, cursor } } };
  }
  console.log('');
  return rows;
};

// Same rule as filterLicensesByAssociation in backend/daily-pull/sync-to-cms-methods.js, which
// cannot be required here because that module pulls in Wix runtime dependencies.
const licensesForSite = (licenses, association) =>
  (Array.isArray(licenses) ? licenses : []).filter(
    license => !license || !license.association || license.association === association
  );

// Order-insensitive comparison: the feed and the CMS serialise the same object with different key
// orders, and a bare JSON.stringify would flag every row as changed.
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        if (value[key] !== undefined && value[key] !== null) acc[key] = canonical(value[key]);
        return acc;
      }, {});
  }
  return value ?? null;
};
const normalize = value => JSON.stringify(canonical(value));
const storedDate = value => (value && typeof value === 'object' ? value.$date : value) || null;
const isStaff = memberships => (memberships || []).some(m => m?.membertype === PAC_STAFF);

const planPatches = ({ rows, feed, association, args }) => {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = [];
  const skipped = {
    notVisible: 0,
    optOut: 0,
    dropped: 0,
    notInFeed: 0,
    unchanged: 0,
    outOfScope: 0,
    staff: 0,
  };
  for (const row of rows) {
    if (args.memberId && String(Math.trunc(row.memberId)) !== args.memberId) continue;
    if (row.isVisible !== true) {
      skipped.notVisible += 1;
      continue;
    }
    if (row.optOut === true) {
      skipped.optOut += 1;
      continue;
    }
    if (row.action === 'drop') {
      skipped.dropped += 1;
      continue;
    }
    const feedMember = feed.get(String(Math.trunc(row.memberId)));
    if (!feedMember) {
      skipped.notInFeed += 1;
      continue;
    }

    const desired = {
      memberships: feedMember.memberships || [],
      licenses: licensesForSite(feedMember.licenses, association),
      [ASSOCIATION_EXPIRATION_FIELD]: resolveAssociationExpiration(feedMember, association),
    };
    const desiredExpiration = desired[ASSOCIATION_EXPIRATION_FIELD]
      ? desired[ASSOCIATION_EXPIRATION_FIELD].toISOString()
      : null;
    const currentExpiration = storedDate(row[ASSOCIATION_EXPIRATION_FIELD]);
    const changed = {
      memberships: normalize(row.memberships) !== normalize(desired.memberships),
      licenses: normalize(row.licenses || []) !== normalize(desired.licenses),
      [ASSOCIATION_EXPIRATION_FIELD]:
        (currentExpiration || '').slice(0, 10) !== (desiredExpiration || '').slice(0, 10),
    };
    // Licenses are written alongside, as the sync would, but never select a row on their own: the
    // feed now carries an `association` key on each license that older stored rows lack, which is
    // format drift on ~11k ASCP rows, not lost data.
    if (!changed.memberships && !changed[ASSOCIATION_EXPIRATION_FIELD]) {
      skipped.unchanged += 1;
      continue;
    }

    const movesLater =
      (desiredExpiration || '').slice(0, 10) > (currentExpiration || '').slice(0, 10);
    const membershipSet = list =>
      normalize((list || []).map(m => [m?.association, m?.membertype]).sort());
    const typeOrAssociationChanged =
      membershipSet(row.memberships) !== membershipSet(desired.memberships);
    if (args.scope === 'lost' && !movesLater && !typeOrAssociationChanged) {
      skipped.outOfScope += 1;
      continue;
    }

    const staff = isStaff(row.memberships) || isStaff(desired.memberships);
    if (staff && !args.includeStaff) {
      skipped.staff += 1;
    }

    candidates.push({
      _id: row._id,
      memberId: Math.trunc(row.memberId),
      fullName: row.fullName,
      hasLogin: Boolean(row.wixMemberId),
      staff,
      hiddenToday: Boolean(currentExpiration) && currentExpiration.slice(0, 10) < today,
      changed,
      before: {
        memberships: row.memberships,
        licenses: row.licenses,
        [ASSOCIATION_EXPIRATION_FIELD]: currentExpiration,
      },
      after: { ...desired, [ASSOCIATION_EXPIRATION_FIELD]: desiredExpiration },
    });
  }
  return { candidates, skipped };
};

const toPatch = candidate => ({
  dataItemId: candidate._id,
  fieldModifications: [
    {
      fieldPath: 'memberships',
      action: 'SET_FIELD',
      setFieldOptions: { value: candidate.after.memberships },
    },
    {
      fieldPath: 'licenses',
      action: 'SET_FIELD',
      setFieldOptions: { value: candidate.after.licenses },
    },
    {
      fieldPath: ASSOCIATION_EXPIRATION_FIELD,
      action: 'SET_FIELD',
      setFieldOptions: {
        value: candidate.after[ASSOCIATION_EXPIRATION_FIELD]
          ? { $date: candidate.after[ASSOCIATION_EXPIRATION_FIELD] }
          : null,
      },
    },
  ],
});

const applyPatches = async (token, toWrite) => {
  const outcome = { successes: 0, failures: 0, errors: [] };
  for (let i = 0; i < toWrite.length; i += PATCH_BATCH) {
    const batch = toWrite.slice(i, i + PATCH_BATCH);
    const data = await wixJson(token, `${WIX_DATA}/bulk/items/patch`, {
      method: 'POST',
      body: JSON.stringify({ dataCollectionId: COLLECTION, patches: batch.map(toPatch) }),
    });
    const meta = data.bulkActionMetadata || {};
    outcome.successes += meta.totalSuccesses || 0;
    outcome.failures += meta.totalFailures || 0;
    (data.results || []).forEach((result, index) => {
      const error = result?.itemMetadata?.error;
      if (error) outcome.errors.push({ memberId: batch[index].memberId, error });
    });
    console.log(`  patched ${Math.min(i + PATCH_BATCH, toWrite.length)}/${toWrite.length}`);
  }
  return outcome;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const { siteId, association } = SITES[args.site];
  console.log(`Site ${args.site} (${association}) — ${args.apply ? 'APPLY' : 'DRY RUN'}`);

  const token = getSiteToken(siteId);
  const pacKey = await getPacKey(token);
  if (args.feedDir) fs.mkdirSync(args.feedDir, { recursive: true });

  console.log('Loading PAC feed…');
  const feed = await loadFeed(pacKey, args.feedDir);
  console.log(`  ${feed.size} members in the feed`);
  console.log('Loading collection…');
  const rows = await loadCollection(token);

  const { candidates, skipped } = planPatches({ rows, feed, association, args });
  const eligible = candidates.filter(c => args.includeStaff || !c.staff);
  const toWrite = typeof args.limit === 'number' ? eligible.slice(0, args.limit) : eligible;

  const summary = {
    site: args.site,
    association,
    mode: args.apply ? 'apply' : 'dry-run',
    scope: args.scope,
    ranAt: new Date().toISOString(),
    rowsInCollection: rows.length,
    membersInFeed: feed.size,
    skipped,
    candidates: candidates.length,
    staffCandidates: candidates.filter(c => c.staff).length,
    hiddenTodayCandidates: candidates.filter(c => c.hiddenToday && !c.staff).length,
    withLogin: candidates.filter(c => c.hasLogin && !c.staff).length,
    toWrite: toWrite.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (args.apply && toWrite.length > 0) {
    summary.outcome = await applyPatches(token, toWrite);
    console.log(JSON.stringify(summary.outcome, null, 2));
  }

  const reportDir = path.join(process.cwd(), 'reconcile-reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(
    reportDir,
    `${args.site}-${summary.ranAt.replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(
    reportFile,
    JSON.stringify({ summary, candidates, written: toWrite.map(c => c.memberId) }, null, 2)
  );
  console.log(`Report: ${reportFile}`);
};

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { planPatches, licensesForSite, toPatch, SITES };
