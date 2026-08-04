# Query cookbook

All bodies below are the JSON body for
`POST https://www.wixapis.com/wix-data/v2/items/query`
([docs](https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/query-data-items)).

Send them via `CallWixSiteAPI(siteId, url, method: "POST", body)` or via curl with
`Authorization: $WIX_API_KEY` + `wix-site-id: <siteId>`.

---

## Look up one member

By profile slug (from the URL in the ticket):

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": { "filter": { "url": "karriknowles" }, "paging": { "limit": 1 } }
}
```

By PAC member ID — **number, not string**:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": { "filter": { "memberId": 731898 }, "paging": { "limit": 1 } }
}
```

By email:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": { "filter": { "email": "someone@example.com" }, "paging": { "limit": 1 } }
}
```

By name — `fullName` only, never the encrypted `firstName`/`lastName`:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": { "filter": { "fullName": { "$contains": "Knowles" } }, "paging": { "limit": 20 } }
}
```

## Return only the fields you care about

Large records (galleries, testimonials, rich text) drown the useful bits. Project:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": {
    "filter": { "memberId": 949741 },
    "fields": [
      "memberId",
      "url",
      "fullName",
      "bookingUrl",
      "showBookingUrl",
      "apiBookingUrl",
      "APIBookingUrl",
      "isVisible",
      "action"
    ],
    "paging": { "limit": 1 }
  }
}
```

## Count / scope an issue

How many members are affected, without pulling them all. Use the **dedicated count
endpoint** — `POST https://www.wixapis.com/wix-data/v2/items/count`
([docs](https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/count-data-items)).
Note the different body shape: `filter` sits at the top level, there is no `query` wrapper.

```json
{
  "dataCollectionId": "MembersDataLatest",
  "filter": { "showBookingUrl": false, "bookingUrl": { "$ne": "" } }
}
```

Returns `{"totalCount": 82449}`.

> ⚠️ **Do not rely on `returnTotalCount` in the query endpoint.** Verified 2026-08-04 against
> `MembersDataLatest`: passing `"returnTotalCount": true` — with or without an explicit
> `paging.offset` — returns `pagingMetadata` containing `count`, `offset`, `tooManyToCount`,
> `cursors` and `hasNext`, but **no `total` field**. Use `/items/count` for totals.

## Members who should have been dropped but are still visible

The shape behind the "multies not renewing / expired members still listed" class of ticket:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": {
    "filter": { "action": "drop", "isVisible": true },
    "fields": ["memberId", "url", "fullName", "action", "isVisible", "memberships"],
    "paging": { "limit": 100 }
  }
}
```

Inverse — visible members whose membership already expired:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": {
    "filter": { "isVisible": true, "memberships.expiration": { "$lt": "2026-08-04T00:00:00" } },
    "fields": ["memberId", "url", "memberships", "action"],
    "paging": { "limit": 100 }
  }
}
```

> ⚠️ **`memberships.expiration` is a plain ISO string, not a date.** Compare it as a string.
> Verified 2026-08-04 on ABMP prod: `{"$lt": {"$date": "2026-08-04T00:00:00.000Z"}}` counts
> **0**, while `{"$lt": "2026-08-04T00:00:00"}` counts **1008**. The `$date` wrapper is only
> correct for true DATETIME fields such as `_createdDate` / `_updatedDate`. Note the stored
> strings have no `Z` suffix and no milliseconds — match that format.

## Recently synced records

Useful for confirming whether a nightly run touched a member at all:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": {
    "filter": { "_updatedDate": { "$gte": { "$date": "2026-08-01T00:00:00.000Z" } } },
    "sort": [{ "fieldName": "_updatedDate", "order": "DESC" }],
    "fields": ["memberId", "url", "_updatedDate", "action", "pageNumber"],
    "paging": { "limit": 50 }
  }
}
```

## Combining conditions

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": {
    "filter": {
      "$and": [
        { "isVisible": true },
        { "$or": [{ "showBookingUrl": true }, { "showWebsite": true }] }
      ]
    },
    "paging": { "limit": 25 }
  }
}
```

## Paging past 100

Offset paging (each request may carry its own filter/sort):

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": { "filter": {}, "paging": { "limit": 100, "offset": 100 } }
}
```

Cursor paging for a long scan — set `filter`/`sort` on the **first** request only, then pass
back `pagingMetadata.cursors.next` alone:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": { "cursorPaging": { "limit": 100, "cursor": "<cursors.next>" } }
}
```

---

## Other endpoints

**Collection schema** — field names, types, and which operators each field allows:

```
GET https://www.wixapis.com/wix-data/v2/collections/MembersDataLatest
```

**List all collections on the site:**

```
GET https://www.wixapis.com/wix-data/v2/collections
```

**Full-text search** across fields (`POST .../wix-data/v2/items/search`) — note it takes
`data_collection_id` (snake_case) and a `search` object rather than `query`. Only works on
CMS-native collections. See
[Search Data Items](https://dev.wix.com/docs/api-reference/business-solutions/cms/data-items/search-data-items).

**Aggregate** (`AGGREGATE` is supported on `MembersDataLatest`) for group-by counts, e.g.
distribution of `action` values across the directory.

Other collections worth knowing, from `COLLECTIONS` in `public/consts.js`:
`SiteConfigs`, `CompiledStateCityMap`, `State`, `City`, `interests`,
`contactUsSubmissions`, `updatedLoginEmails`, `QA_Users`, `ButtonClicks`.
