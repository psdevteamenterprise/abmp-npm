# The PAC feed archive (`abmp-backup-api`)

A local archive of **raw PAC API responses**, in the repo behind `BACKUP_API_URL`
(`backend/consts.js`). On this machine:

```
/Users/Matheusa/Documents/GitHub/abmp-backup-api/backups/
```

It is the only record of **what PAC actually sent** and of members' **pre-migration display
preferences**. Neither exists anywhere in the live CMS.

## Layout

Bucketed by the PAC `action` value; each file is a verbatim API page.

| Folder             | Files           | Records                |
| ------------------ | --------------- | ---------------------- |
| `new/`             | `page1.json`    | 233                    |
| `new_Nov18th/`     | `page1..5.json` | 11,960 (full snapshot) |
| `update/`          | `page1.json`    | 954                    |
| `drop/`            | `page1.json`    | **416**                |
| `failed requests/` | —               | empty                  |

13,563 records, 13,478 unique members, all four associations
(ABMP 5,586 / ASCP 6,656 / AHP 1,526 / ANP 176 memberships). Captured **Nov–Dec 2025**.

Shape matches the live PAC API exactly:

```json
{
  "total_results": 954,
  "page_results": 954,
  "total_pages": 1,
  "results": [
    {
      "memberid": 1493418,
      "firstname": "Andrea",
      "lastname": "Williams",
      "email": "…",
      "phones": [],
      "url": "…",
      "action": "update",
      "licenses": [],
      "addresses": [],
      "memberships": [],
      "migrationData": {}
    }
  ]
}
```

## `migrationData` — the part that matters

Present on **every** record and absent from the live CMS. These are the members' legacy display
preferences, carried over at migration:

| Key                                              | Answers the ticket type                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| `opted_out`                                      | _"I asked not to be listed"_                              |
| `interests`                                      | _"my services don't appear"_ (becomes `areasOfPractices`) |
| `website`, `logo_url`                            | _"my website/logo used to show"_                          |
| `schedule_code`                                  | _"my booking link is missing"_                            |
| `show_phone`, `addressinfo`, `show_member_since` | _"my details display wrong"_                              |
| `detailtext`                                     | original profile blurb                                    |

## ⚠️ Limits — read before concluding anything

1. **It is a single Nov–Dec 2025 snapshot, not a continuous log.** There is no record of any
   later sync.
2. **It does not contain every member.** 13,478 records against ~9,400 on the AHP site alone.
3. Therefore **absence proves nothing.** "Not in the backup" does **not** mean "PAC never sent
   it" — the single most tempting wrong inference here.

Presence, by contrast, is solid evidence: if a member is in `drop/`, PAC really did send a drop
for them.

## Recipe: compare legacy preference against live state

Index the archive by `memberid`, then batch-query the CMS. This is how the opted-out check below
was done.

```js
const fs = require('fs');
const dir = '/Users/Matheusa/Documents/GitHub/abmp-backup-api/backups';
const idx = new Map();
for (const d of fs.readdirSync(dir)) {
  const p = `${dir}/${d}`;
  if (!fs.statSync(p).isDirectory()) continue;
  for (const f of fs.readdirSync(p)) {
    if (!f.endsWith('.json')) continue;
    for (const r of JSON.parse(fs.readFileSync(`${p}/${f}`, 'utf8')).results || []) {
      idx.set(r.memberid, { bucket: d, action: r.action, mig: r.migrationData });
    }
  }
}
```

Then, against the live site — `$hasSome` acts as "in" for a NUMBER field:

```json
{
  "dataCollectionId": "MembersDataLatest",
  "query": {
    "filter": { "memberId": { "$hasSome": [804491, 817198, 137584] } },
    "fields": ["memberId", "fullName", "optOut", "isVisible", "action"],
    "paging": { "limit": 40 }
  }
}
```

## Finding on record (2026-08-04)

40 members had `migrationData.opted_out === true`. 32 are still active (`new`/`update`); of those
**29 correctly carry `optOut: true` today**, but **3 do not and are publicly visible on ABMP**:

| memberId | Name                       |
| -------- | -------------------------- |
| 1091946  | Jessica Solorzano-Peterson |
| 881021   | Arlette Underwood          |
| 765272   | Summer Fairbanks           |

**Not confirmed as a bug.** `optOut` is member-editable, so these three may have deliberately
opted back in since migration. That cannot be distinguished remotely — the nightly sync touches
`_updatedDate` on every record, so it is not a usable signal. Raise with PAC rather than assume,
and do not change a member's `optOut` on the strength of this alone.

## Other uses

- **"Was this member ever actually dropped?"** — the `drop/` bucket is ground truth, and is the
  unanswerable question behind the _multies not renewing_ ticket.
- **Provenance** — telling a PAC-sourced record from a Wix-created test account. PAC-sourced
  records have a real sequential `memberId` (~1.2M–1.8M), a `pageNumber` on the CMS side (written
  only while processing a page of the PAC API response), and ISO `membersince`/`expiration`.
  Wix-made test accounts use ids like `11111111`, throwaway email domains, and hand-typed date
  strings such as `"November 2012"`.
