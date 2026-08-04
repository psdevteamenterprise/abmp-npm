---
name: wix-data-query
description: Query the ABMP/ASCP/AHP Wix CMS collections (MembersDataLatest, SiteConfigs, etc.) via the Wix Data REST API to investigate member data issues. Use when a bug report, Monday ticket, or support escalation references a specific member ID, profile slug, or email — e.g. "services don't appear on the website", "book now link missing", "member still showing after they dropped", "expired license rendering", "address/lat-long is wrong", "upgraded membership didn't sync". Also use when you need a collection's real field names, types, or query operators before writing backend code.
---

# Wix Data queries for member data investigations

Read the live CMS record before theorising. Most "the website is wrong" tickets are
answered in one query: the site renders what is in `MembersDataLatest`, so if the field
is wrong there, the bug is in the sync (`backend/daily-pull/`), not in the UI.

## 1. Pick the site

Every association is a **separate Wix site with its own copy of the collections**. A member
who exists on ABMP may not exist on ASCP. Always confirm which site the ticket is about —
the profile URL tells you (`abmpmembers.com` → ABMP, `ascpskincare.com` → ASCP).

| Site                   | siteId                                 | Env  |
| ---------------------- | -------------------------------------- | ---- |
| ABMP Members Directory | `384d680a-2870-4086-bda0-9894ce4503b8` | prod |
| ASCP Members Directory | `1cb02bba-3a36-45e0-bdb4-1a1a2cfe2fdc` | prod |
| AHP Members Directory  | `5553798e-c71e-4a58-9b9e-515803823429` | prod |
| Test ABMP Members      | `cd9fca47-63d3-4538-b26c-1f91ad0a9420` | test |
| Test ASCP Members      | `8c031731-3f58-4d5f-b7dc-6ccabd1b5722` | test |
| Test AHP Members       | `4535a35f-439d-4558-8e68-9000258e2a2a` | test |

Collection IDs are in [`public/consts.js`](../../../public/consts.js) under `COLLECTIONS`.
The main one is `MembersDataLatest`.

## 2. Pick the auth path

**Path A — Wix MCP (preferred when the `CallWixSiteAPI` tool is available).** No secrets to
handle; auth is already managed. This is the path used to validate every recipe in this skill.

```
CallWixSiteAPI(
  siteId:       "384d680a-2870-4086-bda0-9894ce4503b8",
  url:          "https://www.wixapis.com/wix-data/v2/items/query",
  method:       "POST",
  sourceDocUrl: "https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/query-data-items",
  body:         { ...see recipes... }
)
```

**Path B — raw REST**, for scripts, CI, or any session without the MCP. Requires an admin API
key from the [API Keys Manager](https://manage.wix.com/account/api-keys). Two headers, per the
[auth docs](https://dev.wix.com/docs/api-reference/articles/authentication/api-keys/make-api-calls-with-an-api-key):

```bash
curl -s -X POST 'https://www.wixapis.com/wix-data/v2/items/query' \
  -H "Authorization: $WIX_API_KEY" \
  -H "wix-site-id: 384d680a-2870-4086-bda0-9894ce4503b8" \
  -H 'Content-Type: application/json' \
  -d '{"dataCollectionId":"MembersDataLatest","query":{"filter":{"memberId":731898},"paging":{"limit":1}}}'
```

Read the key from the environment (`$WIX_API_KEY`). Never paste a key into a file, a commit,
a Monday comment, or a chat message. `MembersDataLatest` is `read: ADMIN` /
`itemRead: PRIVILEGED`, so a visitor token will return nothing — this is expected, not a bug.

## 3. Query

Full cookbook with copy-paste bodies: [references/recipes.md](references/recipes.md).
The single most common one — look a member up by profile slug:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": { "filter": { "url": "karriknowles" }, "paging": { "limit": 1 } }
}
```

By numeric PAC member ID (note: **number, not string**):

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": { "filter": { "memberId": 731898 }, "paging": { "limit": 1 } }
}
```

## 4. Read the result against the field reference

[references/members-data-latest.md](references/members-data-latest.md) lists every field, its
type, and — importantly — the **traps**. The ones that cause wrong conclusions:

- **`firstName`, `lastName`, `phone`, `toShowPhone` are encrypted.** They support only
  `EQ`, `NE`, `HAS_SOME`, `EXISTS`. A `CONTAINS`/`STARTS_WITH` name search **fails** — it does
  not silently return nothing, it errors. Search by `fullName` (not encrypted) instead.
- **Duplicate legacy field pairs exist**: `showAbmp` _and_ `showABMP`, `apiBookingUrl` _and_
  `APIBookingUrl`. Check both before concluding a value is missing.
- **A `show*` boolean gates almost every "X doesn't appear on the site" ticket.** The data can
  be perfectly correct and still not render because `showBookingUrl` / `showWebsite` /
  `showContactForm` / `showName` is `false`. Check the flag before blaming the sync.
- **`isVisible` and `action`** control directory presence. `action: "drop"` sets
  `isVisible: false` (see `backend/daily-pull/process-member-methods.js`). A member who should
  have been dropped but is still listed will show `action` other than `drop`, or
  `isVisible: true` — that points at the PAC API payload, not at Wix.
- **Two date formats, and mixing them fails silently.** `_createdDate` / `_updatedDate` are
  real `DATETIME` fields using `{"$date":"...Z"}`. But dates inside the `memberships` and
  `licenses` arrays are **plain ISO strings** (`"2027-06-12T00:00:00"` — no `Z`, no ms) and
  must be compared as strings. Verified on ABMP prod: filtering
  `memberships.expiration` with `$date` returns **0**; the same filter as a string returns
  **1008**. A zero here is far more often a wrong filter than a clean bill of health.
- **Totals:** `returnTotalCount` does not return a `total` on this collection. Use
  `POST https://www.wixapis.com/wix-data/v2/items/count` (body: `dataCollectionId` +
  top-level `filter`, no `query` wrapper) → `{"totalCount": N}`.

## 5. Rules

- **Read-only by default.** Query, count, distinct, aggregate, get-schema are all fine to run
  unprompted during an investigation.
- **Never write to a production collection without explicit approval in this conversation.**
  Inserts, updates, patches, and `TRUNCATE` change live member-facing data. State exactly what
  you intend to change and on which site, and wait for a yes. When a fix needs testing, use the
  Test site IDs above.
- **Don't paste member PII into external systems.** These records contain real names, emails,
  phone numbers, and home addresses. Quote the minimum needed — a member ID and the one wrong
  field — when writing a Monday comment or a commit message.
- Ground endpoints in docs, not memory. If you need an endpoint this skill doesn't cover, find
  it with `SearchWixRESTDocumentation` first.
