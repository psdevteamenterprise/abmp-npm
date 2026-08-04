# `MembersDataLatest` field reference

Captured from the live **ABMP Members Directory** collection schema
(`GET https://www.wixapis.com/wix-data/v2/collections/MembersDataLatest`) on 2026-08-04,
collection revision `102`. Re-run that call to refresh — the schema is the source of truth,
this file is a convenience copy.

Permissions: `read/insert/update/remove: ADMIN`, `dataPermissions.itemRead: PRIVILEGED`.
Paging modes: `OFFSET`, `CURSOR`. Supports `COUNT`, `DISTINCT`, `AGGREGATE`.

## Identity

| Field                           | Type       | Notes                                                                                                                                                    |
| ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_id`                           | TEXT       | Wix item ID (system)                                                                                                                                     |
| `memberId`                      | **NUMBER** | PAC member ID. Filter with a number, not a string.                                                                                                       |
| `url`                           | TEXT       | Profile slug, e.g. `karriknowles` → `/profile/karriknowles`. Uniqueness enforced by `ensureUniqueUrl` in `backend/daily-pull/process-member-methods.js`. |
| `generatedUrl`                  | BOOLEAN    | True when the slug was auto-generated rather than PAC-supplied                                                                                           |
| `wixMemberId`                   | TEXT       | Wix Members app ID                                                                                                                                       |
| `wixContactId`                  | TEXT       | Wix CRM contact ID                                                                                                                                       |
| `contactId`                     | TEXT       | Legacy contact ID field                                                                                                                                  |
| `_owner`                        | TEXT       | System                                                                                                                                                   |
| `_createdDate` / `_updatedDate` | DATETIME   | `{"$date":"...Z"}` shape                                                                                                                                 |
| `pageNumber`                    | NUMBER     | Which PAC API page last wrote this record — useful for tracing a sync run                                                                                |

## Name and contact

| Field                               | Type           | Notes                                                                               |
| ----------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `firstName`                         | TEXT           | 🔒 **encrypted** — only `EQ`, `NE`, `HAS_SOME`, `EXISTS`                            |
| `lastName`                          | TEXT           | 🔒 **encrypted** — same restriction                                                 |
| `fullName`                          | TEXT           | Not encrypted → **use this for name searches** (`CONTAINS`, `STARTS_WITH` all work) |
| `businessName` / `showBusinessName` | TEXT / BOOLEAN |                                                                                     |
| `email`                             | TEXT           | Login email                                                                         |
| `contactFormEmail`                  | TEXT           | Where contact-form mail goes; diverges from `email` by design                       |
| `phone`                             | TEXT           | 🔒 **encrypted**                                                                    |
| `toShowPhone`                       | TEXT           | 🔒 **encrypted** — the phone actually rendered                                      |
| `phones`                            | ARRAY          | Full list from PAC                                                                  |

## Membership and licensing

| Field           | Type    | Notes                                                                                        |
| --------------- | ------- | -------------------------------------------------------------------------------------------- |
| `action`        | TEXT    | From the PAC API: `new` / `update` / `drop` / `none`. Drives `isVisible`.                    |
| `isVisible`     | BOOLEAN | `action !== 'drop'`. Controls directory listing.                                             |
| `optOut`        | BOOLEAN | Member-chosen suppression, independent of `action`                                           |
| `memberships`   | ARRAY   | `{association, membertype, expiration, membersince}`                                         |
| `licenses`      | ARRAY   | `{association, state, license, exempt}` — filtered per-site by `filterLicensesByAssociation` |
| `showLicenseNo` | BOOLEAN |                                                                                              |

## Location

| Field                  | Type   | Notes                                                                              |
| ---------------------- | ------ | ---------------------------------------------------------------------------------- |
| `addresses`            | ARRAY  | `{key, line1, line2, city, state, postalcode, latitude, longitude, addressStatus}` |
| `addressDisplayOption` | ARRAY  | `[{key, isMain}]` — which address is primary                                       |
| `addressInfo`          | OBJECT | Map of address `key` → display mode                                                |
| `locHash`              | ARRAY  | Geohash (precision 3, see `GEO_HASH_PRECISION`) used for proximity search          |

`addressStatus` values come from `ADDRESS_STATUS_TYPES` in `public/consts.js`:
`full_address`, `state_city_zip`, `dont_show`.

## Profile content

| Field              | Type          | Notes                                                                                                 |
| ------------------ | ------------- | ----------------------------------------------------------------------------------------------------- |
| `areasOfPractices` | ARRAY         | **This is the "services" list** members complain about. There is no field literally named `services`. |
| `aboutService`     | RICH_TEXT     | HTML string                                                                                           |
| `testimonial`      | ARRAY         | Free-text testimonials                                                                                |
| `gallery`          | MEDIA_GALLERY |                                                                                                       |
| `bannerImages`     | ARRAY         |                                                                                                       |
| `profileImage`     | IMAGE         | `wix:image://` URI                                                                                    |
| `logoImage`        | URL           |                                                                                                       |
| `title`            | TEXT          | Default CMS field, generally unused                                                                   |

## Display flags — check these first on "X doesn't appear" tickets

| Field                         | Type    |
| ----------------------------- | ------- | --------------------------------- |
| `showName`                    | BOOLEAN |
| `showPhone`                   | BOOLEAN |
| `showWebsite`                 | BOOLEAN |
| `showWixUrl`                  | BOOLEAN |
| `showContactForm`             | BOOLEAN |
| `showBookingUrl`              | BOOLEAN |
| `showBusinessName`            | BOOLEAN |
| `showLicenseNo`               | BOOLEAN |
| `showAbmp` **and** `showABMP` | BOOLEAN | ⚠️ two separate fields both exist |

## Links

| Field                                   | Type | Notes                                                                                                                                          |
| --------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `website`                               | URL  | Member's own site                                                                                                                              |
| `bookingUrl`                            | URL  | Member-entered booking link; rendered only when `showBookingUrl` is `true`                                                                     |
| `apiBookingUrl` **and** `APIBookingUrl` | TEXT | ⚠️ two separate fields. Can contain a raw HTML embed blob (e.g. a Genbook `<script>` badge), not just a URL — don't assume it parses as a URL. |

## Known traps

1. **Encrypted fields reject substring operators.** `CONTAINS` on `firstName` errors out. Use
   `fullName`.
2. **Duplicate-case field pairs** (`showAbmp`/`showABMP`, `apiBookingUrl`/`APIBookingUrl`) are
   real and both queryable. A value "missing" from one may be present in the other.
3. **`memberId` is a NUMBER.** `{"memberId": "731898"}` matches nothing and returns an empty
   list rather than an error — the most common false "member not found".
4. **Per-site collections.** Absence on one site is not absence everywhere.
5. **Eventually consistent.** A write may not be visible to the next immediate query.
6. **Two different date formats.** Only true `DATETIME` fields (`_createdDate`,
   `_updatedDate`) use the `{"$date":"...Z"}` form. Dates _inside_ the `memberships` and
   `licenses` arrays — notably `memberships.expiration` and `memberships.membersince` — are
   **plain ISO strings without a `Z` or milliseconds** (`"2027-06-12T00:00:00"`) and must be
   filtered as strings. Using `$date` against them silently returns zero rows rather than
   erroring, which reads as "no affected members" when there may be thousands.
7. **`returnTotalCount` yields no `total`** on this collection — use
   `POST /wix-data/v2/items/count` instead.
8. **`{"$ne": ""}` also matches rows where the field is absent.** Verified 2026-08-04: filtering
   `{"website": {"$ne": ""}}` returned 300 rows whose projected `website` and `bookingUrl` came
   back empty — the field simply wasn't set on them. So `$ne ""` is _not_ "has a value", and any
   count built on it is inflated. To mean "actually has a value", pair it with
   `{"$exists": true}` or filter/verify client-side after projecting the field.

## No regex filtering

Wix Data has no regex operator, so you cannot ask the API questions like "domains containing a
digit". Project the field, page through, and evaluate in JS.
