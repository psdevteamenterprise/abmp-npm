# Per-association expiry — implementation plan

Monday ticket [12423706293](https://pac-crew.monday.com/boards/18414915876/pulses/12423706293),
"Multies not renewing all associations aren't dropped from expired associations".

Raised by Lara Bracciante (PAC). Solution shape proposed by Drew Zarn (PAC) and endorsed by Lara.

## Status — 2026-08-28

| Item                             | State                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| 1. `associationExpiration` field | **Done** — all 6 sites, type `DATETIME`. Index not confirmed |
| 2. Derive on sync                | Built. **Not yet exercised anywhere**                        |
| 3. Backfill + dry-run report     | Built, run on all 3 test sites                               |
| 4. Search gate                   | Built, verified on test                                      |
| 5. Profile / router gate         | Built, verified on test                                      |
| 6. Login / edit access gate      | Built, verified on test                                      |
| 7. The 90 interim removals       | Blocked on Lara: remove outright, or mark dropped?           |

Release 1 is [PR #133](https://github.com/psdevteamenterprise/abmp-npm/pull/133); release 2 is
[PR #134](https://github.com/psdevteamenterprise/abmp-npm/pull/134), stacked on it.

### Verified on the test sites

Published under the `matheus` dist-tag and checked against real data:

- an expired member is **absent from directory search**
- their **profile page 404s** rather than rendering
- an **open session ends** on reload, and login is refused
- a current member is unaffected in all three

### Measured, not assumed

On Test ABMP, of **93,702 members currently visible** in the directory, **10,262 have an expiration
already in the past** — roughly **11%, about one listing in nine**, would disappear the moment the
gate goes live. Every record on that site has a value, so nothing is hidden for want of a date.

That figure matters more than the no-readable-date count we promised Drew, which came out at zero.
The production equivalent should be measured and sent to PAC **before** release 2 is published.

### Still to do

1. Exercise item 2 — the sync has never written this field anywhere. Run the daily pull on a test
   site with `includeNone: true` and confirm a member's date is refreshed rather than nulled. Until
   this is proven, a renewal silently fails to restore anyone.
2. Production dry run per site, and send PAC the impact number.
3. Production transition (release 1), verify.
4. Re-run the backfill, then publish release 2.

### Known consequence, not yet addressed

A refused member currently lands on the page's error state — _"There appears to be an issue with
this page, please email expectmore@abmp.com"_ — rather than a message explaining that their
membership has lapsed. That is pre-existing behaviour for dropped members, but release 2 turns it
from a handful of people into potentially thousands, each of whom may raise a support ticket for
something working as designed. Worth PAC deciding what those members should see.

---

## The problem

The PAC API sends **one `action` for the whole person**, but membership is **per association**. Our
`isVisible` is derived from that single action, so it cannot express "expired on ABMP, still active
on ASCP". A member who is still active _somewhere_ stays visible _everywhere_.

Confirmed live on member `916468`: ABMP expired 2026-07-18, ASCP active to 2027-07-18, still listed
on the ABMP directory.

This is not an API defect to be fixed upstream. PAC has asked us to solve it on the Wix side using
data the feed already sends, and no API change is required.

## What we already have

`memberships[].expiration` is **already stored on every record**. We are not asking PAC for new data.

```
memberships: [{ association, membertype, membersince, expiration }, ...]
```

`expiration` is a plain ISO string with no `Z` and no milliseconds — `"2027-06-12T00:00:00"`. Dates
_inside_ the `memberships` and `licenses` arrays are strings; top-level dates such as `_updatedDate`
use the `{"$date": "..."}` form. Filtering the array dates with `$date` silently returns zero rows
rather than erroring, which reads as "no affected members" when there may be thousands.

The site's own association comes from `siteConfigs[CONFIG_KEYS.SITE_ASSOCIATION]`, already read in
`backend/routers/methods.js`.

---

## Answers from PAC (Drew Zarn, 2026-08-26)

| Question                                        | Answer                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Is the 10-day grace period already in the date? | **Yes** — hide the moment it passes                              |
| Does `drop` override in both directions?        | **Yes** — dropped wins; a passed date with no drop still hides   |
| Does a partial renewal always arrive `update`?  | **Yes** — the whole design rests on this                         |
| Missing or unreadable expiration date?          | **Hide** — "shouldn't happen. I would say hide, this is invalid" |

The last answer went **against our recommendation**. We proposed showing those members so a data
glitch could never remove someone who is paying. Drew's call stands and is defensible, and it has a
side benefit: "hide" is a clean indexed range scan, whereas "show" needed an OR/not-exists clause
that weakens index usage across ~187k records.

The risk is still real, so the backfill (item 3) **reports how many existing records come out with
no readable date before anything goes live**. That number is the blast radius of this decision. If
it is small we carry on; if it is large, Drew gets to revisit it with real figures rather than a
hypothetical.

---

## The rule

A listing is visible on a site when **the member's expiration date for that site's own association
is today or later, and they are not dropped.**

| Condition                              | Result  |
| -------------------------------------- | ------- |
| Expiration today or later, not dropped | Visible |
| Expiration in the past                 | Hidden  |
| No expiration, or unreadable           | Hidden  |
| `action === 'drop'`                    | Hidden  |

Evaluated **at query time against today**, never precomputed into a flag. The stored date does not
move; today does. Expiry therefore happens on its own, with nothing sent to us on the day.

Applies to the lapsed association only. Associations the member still belongs to are untouched.
Because each association is a separate Wix site with its own collection, that falls out naturally.

---

## Design

Add a scalar **`associationExpiration` (Date and Time)** to `MembersDataLatest` on each site, holding the
expiration for _that site's_ association only. ABMP's copy holds the ABMP date, ASCP's the ASCP
date, AHP's the AHP date.

### Why the copied field is required, not an optimisation

Wix Data **cannot correlate two conditions within the same array element**. A filter of
`memberships.association = "ABMP"` AND `memberships.expiration < today` can be satisfied by two
_different_ entries — matching a member whose ABMP is current and whose ASCP has lapsed.

Measured on a sample of 100: **~25% of matches were exactly that case.** The naive query removes
paying members. It is also unindexable on a collection this size.

### Why a stored date and not a nightly boolean

83% of members are not touched by the sync in a given month, so a recomputed flag would simply never
flip for them. A stored date needs nothing to happen — today advances by itself. Wix also documents
boolean fields as poor index candidates.

### Why `Date and Time` and not `Date`

Wix has two date types and they take **different shapes**:

| Field type        | Value it expects                               |
| ----------------- | ---------------------------------------------- |
| **Date**          | plain string `"YYYY-MM-DD"`                    |
| **Date and Time** | object `{"$date": "YYYY-MM-DDTHH:mm:ss.sssZ"}` |

The field was first created as **Date**, on the reasoning that a date-only type carries no
timezone. But the code writes a JavaScript `Date`, which Wix stores as the `$date` object form, so
every written value tripped the CMS warning _"This value doesn't match the Date field type."_
Changed to **Date and Time** on all six sites on 2026-08-28; the values already written were
already in the right shape, so nothing needed migrating and no code changed.

The timezone concern that motivated `Date` is handled in code instead: expirations are pinned to
UTC midnight and "today" is Denver's calendar day, also at UTC midnight, so the comparison is exact.

A record with no date is excluded by `.ge()`, which is the behaviour Drew asked for. That exclusion
is **assumed, not measured** — the collection has form here, since `{"$ne": ""}` also matches rows
where the field is absent. If `.ge()` turned out to include absent-field rows, members with no date
would stay visible, which is today's behaviour rather than a regression. The dry-run report gives
the size of that group either way.

**Check a stored value, not just the docs.** This is exactly how the type mismatch was missed: the
data-types page states the rule plainly, and it still took reading a real record to notice that what
we wrote did not match the column.

### Index headroom

Confirmed on `MembersDataLatest` (2026-08-05): 17 indexes exist but only **3 are user-created**
(`firstName`, `memberId`, `url` unique). Quota is 8 single-field regular, 2 unique, 15 total — so 2
of 8 and 3 of 15 are in use. There is room.

### Known limitation

This makes **expiry** feed-independent but not **renewal**. The stored date only changes when the
sync writes the member, which is why Drew's confirmation that a partial renewal always arrives with
`action: update` is load-bearing. If a renewal could arrive without it, a member would stay hidden
after paying.

---

## Work items

| #   | Item                                                                                                     | Where                                                           |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Add `associationExpiration` + index on 3 prod and 3 test sites                                           | CMS schema                                                      |
| 2   | Derive on sync — match the membership whose `association` equals `SITE_ASSOCIATION`, parse, write        | `backend/daily-pull/process-member-methods.js`                  |
| 3   | **One-off backfill** across ~187k records — batched, resumable, and reporting the no-readable-date count | new task                                                        |
| 4   | Search gate — add the date condition to the base query beside `.eq('isVisible', true)`                   | `backend/cms-data-methods.js`                                   |
| 5   | Profile / router gate — same rule, so an expired profile 404s instead of rendering                       | `backend/members-data-methods.js`, `backend/routers/methods.js` |
| 6   | Login / edit access gate                                                                                 | members-area flow                                               |
| 7   | The 90 interim removals, plus the reversal list                                                          | data task                                                       |

### Item 2 — the write path

`generateUpdatedMemberData` already has an **"Always update these core fields from API"** block,
which is where this belongs, next to `isVisible`:

```js
// Always update these core fields from API
action: inputMemberData.action,
licenses: inputMemberData.licenses || [],
memberships: inputMemberData.memberships,
pageNumber: currentPageNumber,
isVisible: inputMemberData.action !== MEMBER_ACTIONS.DROP,
```

It must be in the always-update list, not in `getNewMemberOnlyFields` — that returns `{}` for
members who already exist, so anything placed there would never refresh on renewal.

### Item 4 — do not filter after paging

An earlier POC on this same ticket (branch `poc/hide-members-expired-site-membership`, July 2026)
hit this and it is easy to repeat. It filtered the expired members out **after** the query had
already taken a random page, so pages came back short whenever expired members fell inside the
window. The fix there was to fetch the full candidate set, filter in JS, then select the page —
which works but reads every candidate on every search.

The design in this document avoids the problem rather than working around it: the date lives in a
real indexed field, so the filter goes **into** the query and Wix does the paging over the already
filtered population. No post-query predicate is needed.

The random skip on the non-nearby path needed no change in the end: `count()` and `skip()` in
`run()` both operate on the same filtered query, so the population they page over is already the
correct one.

### Item 6 is the expensive one, and it is separable

Hiding a listing is a query change. Cutting login and edit access touches the members-area auth
flow, not just the directory query and the profile router. If PAC wants the visible half sooner,
items 1–5 ship without it.

### Item 3 is the bulk of the work

The risk in this project sits in the backfill, not in the query.

---

## Sequencing

The expected collision with **PR #126** did not materialise. That PR rewrites `getMemberBySlug`,
but item 5 deliberately does not touch it: `getMemberBySlug` also backs URL uniqueness during the
sync, where an expired member's slug must still count as taken or a new member could claim it and
collide. The gate went into `getMemberProfileData` instead, so the two changes do not overlap.

PR #126 is still worth merging on its own account — it is the fix for the race that produced the
duplicate rows found on ASCP.

---

## Open decisions

### 1. Timezone for "today" — SETTLED

PAC operates from Denver and the stored dates carry no zone, so "today" is Denver's calendar day,
resolved through `Intl` and pinned to UTC midnight to match how the expirations are stored.

This is not cosmetic. Denver is UTC-6/-7, so UTC rolls over first: at 19:00 on the 11th in Denver
it is already the 12th in UTC. A member whose membership runs to the 11th is still valid — the
grace period is baked into the date — but a UTC-derived "today" would compare them against the 12th
and hide them hours early, every evening, for everyone expiring that day.

### 2. The 90 interim removals are temporary by construction

Once the backfill lands, those members are hidden by their own dates anyway. So whatever we do for
them **must be reversible**.

The only durable manual mechanism is `optOut`: `isVisible: false` is recomputed away on the next
sync, because `generateUpdatedMemberData` always rewrites it from `action`. `optOut` survives
because it is written only in `getNewMemberOnlyFields`, which returns `{}` for existing members.

But `optOut` also never clears itself. **If those flags are not cleared when the permanent fix
ships, all 90 stay hidden forever, including after they renew.** Keeping the list of exactly who was
changed is a correctness requirement, not bookkeeping.

Still awaiting Lara's choice between removing the listings outright and marking them dropped. We
recommend marking them dropped: it takes them off the directory just the same, but keeps photos,
services and testimonials, so a renewal restores everything rather than the member re-entering it.

---

## Rollout order — this can empty a live directory

The search gate excludes any member with no expiration date. **Until the backfill has run, that is
every member on the site.** Publishing it to a site whose data is not already migrated would empty
the directory, not degrade it.

There is no feature flag. The ordering is enforced by shipping two npm versions, and that only
works if the order is respected:

| Release | Contains                                         | Visitor-visible change   |
| ------- | ------------------------------------------------ | ------------------------ |
| **1**   | Item 3 — the rule module and the backfill task   | none, write-only         |
| **2**   | Items 2, 4 and 5 — sync derivation and the gates | **yes, this is the one** |

Between them, per site: run the backfill dry run, send PAC the no-readable-date count, run the
backfill for real, confirm the data looks right. Only then publish release 2.

**Release 2 must not be published to a site whose backfill has not run.** Nothing in the code
prevents it; the separation is the safeguard.

### The gap this split opens

The sync derivation (item 2) is in release 2, not release 1, so **between the backfill running and
release 2 publishing, nothing keeps the field current**. A member who renews in that window keeps
their old expired date, and the moment release 2 lands they are hidden despite having paid.

**Re-run the backfill immediately before publishing release 2.** It is idempotent — it only
rewrites records whose stored value disagrees — so the second run touches only the members who
changed, and it closes the window completely.

## Collection sizes

Measured 2026-08-27 via `/wix-data/v2/items/count`:

| Site  | Records     |
| ----- | ----------- |
| ABMP  | 103,831     |
| ASCP  | 69,717      |
| AHP   | 13,385      |
| Total | **186,933** |

Earlier drafts of this plan assumed ~83k. The real figure is more than double that, which is why
the backfill runs as a scheduled task on Wix rather than over the REST API from a laptop.

## The interim spreadsheet

`Non-renewing individual divisions.xlsx`, attached to the ticket and forwarded by Lara on
2026-08-26. Column A is member ID, column D is the association to **keep**. 90 rows, 88 distinct
(member, association) pairs — ABMP 22, ASCP 56, AHP 10.

Lara resolved the three data faults on 2026-08-27:

- **`1469959`** (Delcastillo Dixon, Dalexys), listed on both the ABMP and ASCP tabs — keep ABMP,
  drop ASCP. The ABMP row was "bad data interpretation on our part".
- **`836430`** (Mixer, Kayla), listed twice on the ASCP tab — keep ABMP, drop ASCP.
- **`1440721`** (Akers, Lillian Rose), twice on the AHP tab with different associations to keep —
  keep ASCP **and** ABMP, drop AHP. She is a triple.

### The removals look unnecessary

Checked against live production data on 2026-08-28. Of the 56 members on the ASCP list, 53 still
exist on that site, and **all 53 have an ASCP expiration already in the past** — every one of them
paired with a still-current membership on the association they kept. The ABMP list matches: every
member found has a past ABMP date and a 2027 date on the association they kept.

That is the pattern the gate is built for. Once release 2 is published, these members are hidden by
their own dates, on the correct site only, with nothing manual to do and nothing to reverse later.

This removes the mechanism question entirely. There is no need to choose between deleting the
listings and marking them dropped, and no `optOut` flags to set and then remember to clear — which
was the part of that plan most likely to strand someone after they renewed.

The removals would only still be needed if PAC wants these listings gone **before** release 2 ships.
Given the two steps run back to back, that window is about an hour.

---

## Scope boundary

**Multies only.** Single-association members past expiry who were never dropped are a separate and
larger population — roughly 2x in a 100-record sample — and are deliberately out of scope here.
Related to Nathalie's "terminated expired member with API action of update rather than drop" thread,
and to the broader gap that a member deleted outright from PAC's database is never removed from the
Wix sites at all, because the sync only ever acts on the `action` field.

---

## Effort

Re-costed 2026-08-28, after items 1-6 were built. The original estimate is kept beside it because
two of its lines were wrong in ways worth remembering.

| Item                       | Original   | Revised   | Note                                          |
| -------------------------- | ---------- | --------- | --------------------------------------------- |
| 1. Field + index           | _in 11-15_ | 2-3       | Fast, but the wrong field type cost rework    |
| 2. Derive on sync          | _in 11-15_ | 4-6       | 17 lines; the cost was the shared rule module |
| 3. Backfill + report       | 10-14      | 12-16     | Slightly under                                |
| 4. Search gate             | _in 11-15_ | 2-3       | 9 lines, once the field exists                |
| 5. Profile / router gate   | 4-6        | 2-3       | 8 lines                                       |
| 6. Login / edit access     | 12-16      | 3-5       | **Over-estimated 3-4x**                       |
| **Built so far**           |            | **25-36** |                                               |
| 7. The 90 interim removals | 4-6        | 3-5       | Not started, waiting on Lara                  |
| QA and rollout             | 8-10       | 10-14     | **Revised up** - now the largest item left    |
| **Total**                  | **49-67**  | **38-55** |                                               |

**Item 6 was the big miss.** It was costed as "touches the members-area auth flow, not just a
query" — pricing the area of the code rather than the shape of the change. The flow already refuses
a dropped member in exactly the two places that matter, so the expiry check slotted in beside them.

**QA and rollout went up** and is now the largest remaining item. It is two npm releases, six sites
to verify, production dry runs, three production transitions with run windows, and the reporting we
owe PAC. Coordination time, which does not compress.

Roughly **13-19 hours remain**, most of it rollout rather than code.
