# Prioritise updated listings in directory search — implementation plan

Change request from Lara Bracciante (PAC), raised 2026-08-04. Contracted 2026-08-28 at $7,850,
3–4 weeks. Sites: ABMP, ASCP, AHP.

Listings a member has actually filled out rank above listings still in their post-migration state.

## Status — 2026-08-31: **stage 1 in progress**

| Item                              | State                                                        |
| --------------------------------- | ------------------------------------------------------------ |
| 1. `memberUpdated` field, 3 sites | Code done — field not yet added to the collections           |
| 2. Set it on save                 | **Done** — one write in `saveRegistrationData`, tests pin it |
| 3. Backfill + dry-run report      | Code done — not yet run anywhere                             |
| 4. Typed search ordering          | Not started                                                  |
| 5. "Near me" ordering + radius    | Not started                                                  |
| 6. Radius as site config          | Not started                                                  |
| 7. Pagination stability           | Not started                                                  |
| 8. QA across 3 sites, deploy      | Not started                                                  |

---

## The problem

The ordering rule is trivial. The signal it depends on does not exist.

`MembersDataLatest` has no `published` / `lastEditedByMember` / `hasMemberEdits` field, and
`_updatedDate` cannot substitute: the nightly PAC sync rewrites every member record, so all 83,006
ABMP listings look freshly updated every morning. The signal has to be built, backfilled across
~250,000 records on three sites, and only then applied.

## What PAC decided

| #   | Question                                       | Answer                                                              | Source           |
| --- | ---------------------------------------------- | ------------------------------------------------------------------- | ---------------- |
| 1   | What counts as "updated"?                      | Net-new content only — pre-migration content does not count         | Lara, 2026-08-04 |
| 2   | Does it apply to "near me", and beat distance? | Middle option: **rank by priority within 25 miles, then nearest**   | Lara, 2026-08-05 |
| 3   | Two tiers or graded by completeness?           | **Two tiers.** "I don't want to get this granular"                  | Lara, 2026-08-05 |
| 4   | How many prioritised listings on page one?     | **All of them**, then the rest — not a capped sponsored-style block | Lara, 2026-08-05 |
| 5   | What trips the flag going forward?             | **Any successful save**                                             | Lara, 2026-08-05 |
| 6   | Does the 25-mile rule apply to typed search?   | **No** — flag order only, no radius                                 | Lara, 2026-08-27 |

Decision 1 fixes the backfill rule to the five fields the migration never wrote, and with it the
size of tier 1 — see below.

### Decision 6

Madeline put this to Lara on 2026-08-24: a typed search (someone enters a zip without sharing
their location) gives the site no coordinates, there is no zip-to-location lookup built, and adding
one would revise the quote. Lara replied on 2026-08-27 — _"We are good to move forward on this"_ —
declining the lookup and taking the build as quoted. Madeline sent the contract the next day.

Exhibit C's total (≈6–8 working days) is the 41–60h estimate, i.e. **the figure that excludes the
location lookup**, which matches. So the radius applies in "near me" only, and typed searches order
by the flag alone.

Her earlier answers to questions 2 and 4 both say "within 25 miles" as though it applied
everywhere, so restate the distinction in the release notes — not because it is unsettled, but so
the launch matches what she remembers agreeing to.

## Size of the effect

Measured against live ABMP, 2026-08-04.

| Population                                    | Count  | Share |
| --------------------------------------------- | ------ | ----- |
| Directory-eligible listings                   | 83,006 | 100%  |
| Have any content the PAC sync doesn't write   | 20,936 | 25.2% |
| Have content migration could not have written | 7,038  | 8.5%  |
| Have a profile photo                          | 6,737  | 8.1%  |

A 120-row result set therefore holds roughly 10 tier-1 listings — enough to transform page one of
twelve. **Narrow searches may have no tier-1 listings at all**, and the feature will do nothing
visible there. Say this to PAC before launch.

These figures are four weeks old and were only ever taken on ABMP. The dry run re-measures all
three sites before anything is written.

## What we already have

Four findings from the code that change the shape of the work against the original estimate.

### The flag survives the nightly sync for free

`createCoreMemberData` returns `{...existingDbMember, ...alwaysUpdatedFields, ...newMemberFields}`
— [process-member-methods.js:193](backend/daily-pull/process-member-methods.js:193). A field in
neither list is carried straight through. This is the same mechanism that keeps `optOut` alive
while `isVisible` gets rewritten every night.

So the sync needs **no changes**. The requirement is the negative one: do not add the flag to the
always-update block, and prove it with a test. This was the exact trap in the expiry work.

For a genuinely new member the field is absent, which reads as tier 2 — correct.

### One save chokepoint, not several

The scoping doc assumed several independent save handlers. All three save buttons and the gallery
save funnel through `saveData` → [saveRegistrationData](backend/members-data-methods.js:388),
which has exactly one caller. With decision 5 being "any save counts", this is a single write in a
single place.

### Pagination is already correct

[handlePagination](public/Utils/homePage.js:158) calls `paginateSearchResults`, which slices the
in-memory 120-row array. It never re-queries. "Shuffle per search, not per page" already holds
within a session.

The residual gap is that `updateUrlParams` writes the page number into the URL, so a reload or a
shared link re-runs the search and reshuffles. Confirm with a test; fix only if it reproduces.

### "Near me" is the cheap path, not the expensive one

[cms-data-methods.js:130](backend/cms-data-methods.js:130): when `isSearchingNearby`, the code
already loads **every** matching row via `fetchAllItemsInParallel`, computes distances, sorts, and
slices 120. Tiering there is pure JS over data we already hold.

The typed path is the hard one. It runs `count()` → random offset → `limit(120)` → shuffle, and
two-tier ordering means two counts and two queries with independent offsets. The original estimate
has these two the wrong way round.

## The rule

**Tier 1** — any of `profileImage`, `gallery`, `bannerImages`, `testimonial`, `businessName` is
present. These are the five fields with no migration counterpart, so they can only have been
entered by the member.

Field names and types verified against the live ABMP collection on 2026-08-31: `profileImage`
IMAGE and `businessName` TEXT hold strings; `gallery` MEDIA_GALLERY, `bannerImages` ARRAY and
`testimonial` ARRAY hold arrays. `testimonial` is singular on the collection — `Profile.js` reads
`profileData.testimonials`, which is the plural alias `backend/routers/utils.js` maps it to.

The migration wrote exactly nine fields — `opted_out`, `show_member_since`, `website`,
`addressinfo`, `interests`, `logo_url`, `detailtext`, `schedule_code`, `show_phone` — mapping onto
`website`, `logoImage`, `areasOfPractices`, `aboutService`, `bookingUrl`, `addressInfo`,
`showPhone`, `optOut`, `showABMP`. Everything else on that list is either sync-written or
migration-written, and neither indicates member activity.

The rule needs no migration baseline and no cross-reference against the archive, which matters:
the archive only covers ~13.5k of the 83k members, so a per-member before/after comparison was
never possible for the rest.

**Tier 2** — everything else.

Ordering:

| Search mode             | Order                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| Typed (no coordinates)  | Tier 1 shuffled, then tier 2 shuffled                                 |
| "Near me" (coordinates) | Tier 1 within the radius shuffled, then everything else nearest-first |

## Design

### The field

`memberUpdated`, boolean, on all six sites (3 test + 3 production). Added to `MEMBERS_FIELDS` in
`public/consts.js` so it comes back in the search projection — without that the tier is invisible
to the ordering code.

Needs an index for the typed path's tier filter at 83k rows. **Headroom re-confirmed against live
ABMP on 2026-08-31**: 17 indexes exist, of which 4 are user-created — `firstName`, `memberId`,
`memberId + _createdDate + _id`, and `url` unique. Quota is 8 single-field regular / 2 unique / 15
total, so 3 of 8 regular are in use. There is room. `associationExpiration` never got one.

### Why a stored boolean and not a computed check

The five-field presence test could be evaluated in JS on every search instead of stored. It cannot,
for the same reason the expiry work needed a copied scalar: Wix Data has no way to filter on
"any of these five fields is non-empty" across a 83k collection, and the typed path never loads the
full set — it jumps to a random offset and takes 120. Tiering has to happen in the query, so the
answer has to be a single indexed field.

### Setting it

One write in `saveRegistrationData`, alongside the existing merge. Any successful save sets it
true; it is never set back to false by anything except the backfill.

### Backfill

Clone [association-expiry-backfill-methods.js](backend/tasks/association-expiry-backfill-methods.js).
That harness — dry-run summary, 1,000-member chunks, members re-read at write time rather than
trusting the queued data — ran clean over 83k on ABMP and is worth reusing wholesale rather than
rewriting. Register in `tasks-configs.js` with `getIdentifier: task => task.data`, and add the
site-side wrapper to each repo's `src/backend/migrationTask.js` so it can be triggered from the
editor sandbox.

Dry run reports, per site: total members, tier-1 count, tier-1 share. Compare against the 8.5%
above before writing anything.

The backfill rule is a judgement call and will promote some members who arguably shouldn't be and
miss others. It is cheap to re-run. Say so to PAC up front rather than defending the first pass.

### Typed search ordering

Two counts and two queries against the same filter set, each with its own random offset, tier 1
first and tier 2 filling the remainder up to 120. Each tier shuffled independently, then
concatenated — tier 1 must stay ahead of tier 2 after the shuffle, so the existing single
`shuffleArray` over the whole result set has to be replaced rather than reused.

`.ne('memberUpdated', true)` for the tier-2 query matches records where the field is absent — the
same behaviour the existing `.ne('optOut', true)` in the base query already relies on.

### "Near me" ordering

All matching rows and their distances are already in memory. Partition into tier 1 within the
radius and everything else; shuffle the first, sort the second by distance; concatenate; slice 120.

### Radius as config

Lara asked for the 25 miles to be adjustable as more profiles fill in. A `CONFIG_KEYS` entry
alongside `SITE_ASSOCIATION`, read at query time, so PAC can dial it down without a release.

## Sequencing

**Stage 1 — the signal.** No visible change; safe to ship on its own.

| PR  | Contents                                                       |
| --- | -------------------------------------------------------------- |
| A   | `memberUpdated` field + `MEMBERS_FIELDS` + set on save + tests |
| B   | Backfill task, task config, site wrappers                      |

Release, dry-run all three production sites, compare against the figures above, then run for real.

**Stage 2 — the ordering.**

| PR  | Contents                                               |
| --- | ------------------------------------------------------ |
| C   | Radius site config                                     |
| D   | Typed search tiering                                   |
| E   | "Near me" tiering                                      |
| F   | Pagination stability across reload — only if it repros |

**Stage 3** — QA across three sites and filter combinations, deploy, monitor.

## Risks

| Risk                         | Note                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Index quota                  | Confirm headroom before building the typed path. No room means a different approach entirely.                    |
| Performance                  | An extra count plus an extra query on every typed search over 83k rows. Measure before and after.                |
| Shuffle across tiers         | The fiddliest part of the build and the likeliest single item to overrun. Tier order must survive randomisation. |
| Flag lost to the sync        | Guarded by the spread order, which is implicit rather than enforced. A test pins it.                             |
| Narrow searches show nothing | 8.5% means a small town may have no tier-1 listings. Tell PAC before launch.                                     |
| Three sites                  | Every item multiplies by three for deploy and QA. Already in the numbers.                                        |

## Appendix — where this lives

| Concern                                            | Location                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| Search query construction, both paths              | `backend/cms-data-methods.js` → `buildMembersSearchQuery`                |
| Random offset, shuffle, distance sort, 120-row cap | same file, `run()`                                                       |
| Search entry point                                 | `backend/search-filters-methods.js` → `filterProfiles`                   |
| Member form save handlers                          | `pages/personalDetails.js` → `saveData`                                  |
| The single backend save funnel                     | `backend/members-data-methods.js` → `saveRegistrationData`               |
| Sync field writer                                  | `backend/daily-pull/process-member-methods.js` → `createCoreMemberData`  |
| Result paging (12 per page)                        | `public/Utils/homePage.js` → `handlePagination`, `paginateSearchResults` |
| Result cap constant                                | `MAX__MEMBERS_SEARCH_RESULTS` in `backend/consts.js`                     |
| Search projection                                  | `MEMBERS_FIELDS` in `public/consts.js`                                   |
| Backfill harness to clone                          | `backend/tasks/association-expiry-backfill-methods.js`                   |
