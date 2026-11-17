---
name: pac-site-member-import
description: One-time first load of a new PAC association site's members (built for ANP, 2026-10) into its empty MembersDataLatest, run locally - download PAC's MigrateMembers feed, build rows with the package's own sync rules, bulk-insert through the Wix CLI token, and verify every row. Use when standing up a new association site or re-seeding a cleared test copy of one, or when the user says "import the members", "migrate members to the new site", "populate MembersDataLatest". Never for the live ABMP/ASCP/AHP sites, day-to-day corrections (wix-data-safe-repair) or replaying a failed sync page (pac-sync-health).
---

# First import of PAC members into a new site

A new association site starts with an empty `MembersDataLatest`. The daily sync only fetches
PAC's `new`, `update` and `drop` actions, so it would never load the existing members (`none`).
The first load comes from PAC's **MigrateMembers** feed and is run once from a laptop with
[`dev-only-scripts/member-import`](../../../dev-only-scripts/member-import/index.js). It replaces
the old `abmp-members-migrator` repo (fetch → enrich → website check → CSV → manual CMS import).

ANP was the last site PAC planned for the foreseeable future. Treat this as a record of how
ANP was loaded and a tool for re-seeding a test copy, not something to point at an existing site.

## What gets migrated

From PAC's ANP brief ("same as ASCP/AHP"), checked against what AHP actually stored:

- **Migrated:** first and last name, phones, addresses, contact-form email, memberships (member
  since, type, expiration), licenses.
- **Not migrated:** none of PAC's `migrationData` profile fields - image, website, booking link,
  about text, interests/services, display phone, opt-out, show-member-since. Members enter these
  on the site. AHP stored none of them: for 10,752 members in both, not one stored value equals
  PAC's.
- **Address visibility:** every address is city/state/zip, as on AHP. PAC's per-address
  `addressinfo` is kept on the row as-is but not applied.

## Before you start

1. **The site's `SiteConfigs.SITE_ASSOCIATION` is set** to the association code. `build` reads it
   from the site and filters the feed by it; nothing else picks the members.
2. **`MembersDataLatest` is empty.** A duplicated site carries the source site's members. Snapshot
   and truncate them first (see the log below). `import` refuses a non-empty collection unless you
   pass `--allow-nonempty`; `build` then de-duplicates slugs against what is there.
3. **The Wix CLI is logged in to the account that owns the site.** Check that `wix token -s <siteId>`
   prints an `OauthNG...` token. The Wix MCP is usually logged in to a different account, so it can't
   reach the PAC sites. Use the CLI token for everything here.
4. **The PAC key** is `PAC_MIGRATOR_API_KEY` in `~/Documents/GitHub/abmp-members-migrator/.env`. Pass
   the file with `node --env-file`; never print the key.
5. **Output goes outside the repo**, e.g. `~/Desktop/<assoc>-import-<date>/`. It holds every
   member's email, phone and address.

## Run it

```bash
SITE=<siteId>; OUT=~/Desktop/<assoc>-import-$(date +%F)
node --env-file=../abmp-members-migrator/.env dev-only-scripts/member-import fetch --out $OUT
node dev-only-scripts/member-import build --site $SITE --out $OUT --association <ASSOC>
node dev-only-scripts/member-import import --site $SITE --out $OUT          # dry run
node dev-only-scripts/member-import import --site $SITE --out $OUT --yes    # inserts
node dev-only-scripts/member-import verify --site $SITE --out $OUT
```

| Step           | Writes                                           | Time (ANP)        |
| -------------- | ------------------------------------------------ | ----------------- |
| `fetch`        | `pac-feed.json` (~130MB, all associations)       | ~20s              |
| `build`        | `rows.json`, `report.json`, `rejected.json`      | seconds           |
| `import --yes` | the site, `import-log.json`                      | 1000 rows/request |
| `verify`       | `verify.json`; exits 1 unless every check passes | seconds           |

**Stop after `build` and show the user `report.json`** before importing. It covers member count,
actions, member types, visible count, expiry outcomes, slug counts and zero-coordinate addresses.
Get a go-ahead before `import --yes`, because it writes to a live site.

`verify` reads every row back and requires no missing or unexpected memberIds, no duplicate
memberIds or slugs (case-insensitive), and every field it wrote unchanged. It's done only when it
prints `VERIFIED`.

## How each field is built

All in [`transform.js`](../../../dev-only-scripts/member-import/transform.js). Where the daily sync
has a rule, the transform imports it from the package rather than copying it.

| Field                               | Rule                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| which members                       | any `memberships[].association === SITE_ASSOCIATION`, drops included                                                                                                                                                                                    |
| `isVisible`                         | `action !== 'drop'`                                                                                                                                                                                                                                     |
| `associationExpiration`             | `classifyAssociationExpiration`, same as the sync and the expiry backfill                                                                                                                                                                               |
| `licenses`                          | only this association's, plus untagged ones (the sync's `filterLicensesByAssociation`)                                                                                                                                                                  |
| `email`, `contactFormEmail`         | `normalizeEmail` (trim + lowercase), as `bulkSaveMembers` does                                                                                                                                                                                          |
| `url`                               | PAC's `url` if it sent one; otherwise the name with whitespace removed, or `firstNameLastName` if the name is blank or non-ASCII. Duplicates get `-1`, `-2`, ... in memberId order, compared case-insensitively, also against slugs already on the site |
| `addresses[].addressStatus`         | always `state_city_zip`                                                                                                                                                                                                                                 |
| `addressDisplayOption`              | `[{ key: firstAddress.key, isMain: true }]`                                                                                                                                                                                                             |
| `locHash`                           | `generateGeoHash` (0/0 coordinates hash to `7zz`, same as the sync)                                                                                                                                                                                     |
| `optOut`, `showABMP`, display flags | the daily sync's new-member defaults (`DEFAULT_MEMBER_DISPLAY_SETTINGS`, `showContactForm: true`)                                                                                                                                                       |

`memberUpdated` is not set, because nobody has edited a listing on a new site yet. Students are
imported like everyone else: the package already keeps them out of directory search and gives
their page the student badge.

## After the import

- **Publish** so `jobs.config` starts the daily sync. It applies later feed changes on top of the
  import.
- Nothing else needs to run: with no profile images or interests imported, the image-migration
  task and `migrateInterests` have nothing to do.

## Gotchas

- **MigrateMembers has no paging.** `?page=2` returns the same body. `total_results` (221,894 on
  2026-10-01) is not the length of `results` (148,730), so count `results`.
- The endpoint is on `members.ascpskincare.com` and serves **all** associations; the site
  association does the filtering.
- Python on this Mac fails TLS (`CERTIFICATE_VERIFY_FAILED`); the tool uses Node `fetch`.
- The per-item result shape of `bulk/items/insert` isn't documented. Trust `verify`, not the
  insert counts.
- Wix reorders object keys and stores dates without milliseconds (`.000Z` → `Z`). `verify`
  compares values with sorted keys and dates as epoch, so a plain `JSON.stringify` diff will show
  every row as mismatched.

## Log

| Date       | Site                                       | Feed members | Built                                                                              | Notes                                                                                                                                                                                               |
| ---------- | ------------------------------------------ | ------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-01 | ANP `45362980-fe21-4132-a5eb-e27789f6010f` | 148,730      | 2,891 (1,792 professional, 1,040 student, 59 PAC staff; 2,875 visible, 16 dropped) | Imported 3/3 batches, `VERIFIED`. Site was a duplicate of AHP prod; 14,076 AHP rows were snapshotted to `~/Desktop/anp-clear-2026-10-01/` and truncated first. 1,025 addresses have 0/0 coordinates |
