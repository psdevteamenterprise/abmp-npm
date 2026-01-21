# Daily Pull - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for the Daily Pull functionality. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The Daily Pull is an automated synchronization process that fetches member data from the PAC (Professional Association Council) API and updates the Wix database. It processes members in batches, handles new and existing members differently, and ensures data integrity through validation and deduplication.

---

## Member Actions

The PAC API returns members with different action types that determine how they should be processed:

### Action Types

- **`new`**: Member is new to the system (doesn't exist in database)
- **`update`**: Member exists in database and needs to be updated
- **`drop`**: Member should be marked as dropped/invisible
- **`none`**: No action needed (member is skipped)

### Action Processing Rules

1. **Members with action `none` are filtered out** - They are not processed during daily pull
2. **Members with action `drop`** are marked as `isVisible: false` in the database
3. **Only members with actions `new`, `update`, or `drop` are processed**

---

## Data Flow

### High-Level Process

1. **Initialization**: `syncMembersDataPerAction()` fetches the first page to determine total pages
2. **Task Scheduling**: All pages are scheduled as separate tasks for parallel processing
3. **Page Processing**: Each page is processed by `synchronizeSinglePage()`
4. **Filtering**: Members are filtered by:
   - Action type (must not be `none`)
   - Site association (must match the current site's association)
5. **Bulk Processing**: Filtered members are processed and saved in bulk
6. **Database Update**: Members are saved to Wix database using `bulkSaveMembers()`

### Site Association Filtering

- Only members whose `memberships` array contains a membership with the site's association are processed
- Example: If site association is `ABMP`, only members with `memberships` containing `association: 'ABMP'` are processed

---

## New vs Existing Members

### Determining Member Status

**Key Logic**: A member is considered "new" if they **do not exist in the database** (checked by `memberId`), regardless of the API's `action` field.

**Reason**: The PAC API's `action` field is not reliable, so we check the database directly to determine if a member is new or existing.

### New Member Fields

The following fields are **ONLY set for new members** (not updated for existing members):

- `memberId` - From API `memberid`
- `firstName` - From API `firstname` (trimmed)
- `lastName` - From API `lastname` (trimmed)
- `fullName` - Generated from firstName + lastName
- `phones` - From API `phones` array
- `toShowPhone` - From `migrationData.show_phone`
- **`optOut`** - **SET TO `false` BY DEFAULT** (see Opt-Out section below)
- `url` - Generated unique URL (see URL Generation section)
- `showContactForm` - Always set to `true` for new members
- `bookingUrl` - From `migrationData.schedule_code` (only if it starts with 'http')
- `APIBookingUrl` - From `migrationData.schedule_code`
- `showABMP` - From `migrationData.show_member_since`
- `locHash` - Generated geohash from addresses
- Default display settings (see Default Display Settings section)

### Existing Member Fields

For existing members, the following fields are **always updated** from the API:

- `action` - Current action from API
- `licenses` - From API `licenses` array
- `memberships` - From API `memberships` array
- `pageNumber` - Current page number being processed
- `isVisible` - `false` if action is `drop`, otherwise `true`

**Note**: New member fields listed above are **NOT updated** for existing members - they retain their existing database values.

---

## Opt-Out Handling

### ⚠️ CRITICAL REQUIREMENT

**Product Requirement**: The `optOut` field should **NOT** be taken from the API. It should be set to **`false` by default** for all new members during daily pull.

**Current Implementation**:

- Location: `process-member-methods.js` line 195
- Current code: `optOut: inputMemberData.migrationData?.opted_out || false`
- **This is INCORRECT per product requirements** (it reads from API's `migrationData.opted_out`)

**Required Implementation**:

```javascript
optOut: false, // Always set to false for new members, not from API
```

**Rationale**:

- Members should NOT be opted out by default - they are opted in by default
- Opt-out status should be managed through the application UI, not via API data
- This ensures consistent default behavior regardless of API data

**Important Notes**:

- This field is only set for **new members**
- For existing members, the `optOut` field is **not updated** during daily pull
- If an existing member's opt-out status needs to change, it must be done manually through the application

---

## Email Handling

### Email Update Rules

1. **New Members (not in database)**:
   - Both `email` (loginEmail) and `contactFormEmail` are set to the API email value

2. **Existing Members - Reinstated with New Email**:
   - Condition: Member exists in DB, API action is `new`, and API email differs from DB email
   - Only `email` (loginEmail) is updated
   - `contactFormEmail` is **NOT updated** (preserves user's contact form preference)
   - Wix Members Area login email is also updated via `changeWixMembersEmails()`

3. **Existing Members - All Other Cases**:
   - **No email fields are updated** - existing values are preserved

### Email Validation

- Email is a **required field** - members without valid email strings are rejected during validation

---

## URL Generation & Uniqueness

### URL Generation Rules

1. **If API provides URL**: Use it as the base URL
2. **If API doesn't provide URL**: Generate from `fullName` (spaces removed)
3. **If name contains non-English characters**: Use fallback `'firstNameLastName'`
4. **URL must be unique**: Check database for conflicts and append counter if needed

### URL Uniqueness Handling

**Within Batch (Same Page)**:

- Members with the same base URL are grouped together
- Counters are assigned sequentially: `baseUrl`, `baseUrl-1`, `baseUrl-2`, etc.
- Database is checked to find the highest existing counter
- New counters start from `max(existingCounter, batchCounter) + 1`

**Cross-Batch (Different Pages)**:

- Database is checked for each URL to ensure no conflicts across pages
- If conflict found, counter is incremented appropriately

**URL Counter Format**:

- Base URL: `johnsmith`
- With counter: `johnsmith-1`, `johnsmith-2`, etc.
- Counter is always numeric and appended with a hyphen

---

## Address Handling

### Address Processing

- Addresses are only enriched for **new members**
- Existing members' addresses are **not updated** during daily pull

### Address Display Status

Addresses have a `addressStatus` field that determines visibility:

- **`FULL_ADDRESS`**: All address details visible (when `addressDisplayInfo[key] === 'all'`)
- **`DONT_SHOW`**: Address completely hidden (when `addressDisplayInfo[key] === 'none'`)
- **`STATE_CITY_ZIP`**: Only state, city, and zip visible (default)

### Address Data Sources

- Primary source: `inputMemberData.addresses` array
- Display configuration: `inputMemberData.migrationData.addressinfo` object
- Each address has a `key` that maps to display configuration

---

## Interests / Areas of Practice

### Processing Rules

1. **Only processed for specific sites**: Currently only `ABMP` site processes interests
2. **Source**: `migrationData.interests` (comma-separated string)
3. **Processing**:
   - Split by comma
   - Trim whitespace
   - Filter out empty strings
   - Store as `areasOfPractices` array

### Site-Specific Configuration

- `SITES_WITH_INTERESTS_TO_MIGRATE`: `['ABMP']`
- Other sites (ASCP, ANP, AHP) do not process interests during daily pull

---

## Default Display Settings

New members receive the following default display settings:

```javascript
{
  showLicenseNo: true,
  showName: true,
  showBookingUrl: false,
  showWebsite: false,
  showWixUrl: true,
}
```

**Note**: These are only set for new members. Existing members retain their current display settings.

---

## Migration Data Enrichment

### Migration Data Fields

The following fields from `migrationData` are used to enrich new member data:

- **`addressinfo`**: Address display configuration (stored as `addressInfo`)
- **`website`**: Member website URL (also sets `showWebsite: true`)
- **`interests`**: Areas of practice (only for ABMP site)
- **`show_phone`**: Phone visibility preference
- **`schedule_code`**: Booking URL
- **`show_member_since`**: Whether to show member since date

### Enrichment Rules

- Migration data is **only applied to new members**
- Existing members do not receive migration data updates
- If `migrationData` is missing, member is still created with core fields

---

## Data Validation

### Required Fields

Members must have the following fields to be processed:

1. **`memberid`**: Must be present (number or string)
2. **`email`**: Must be a non-empty string (trimmed)
3. **`memberships`**: Must be a non-empty array

### Validation Failure

- If validation fails, the member is **skipped** (not saved)
- A warning is logged with the specific validation failure
- Processing continues with remaining members
- Failed members are counted in `totalFailed` statistic

---

## Bulk Processing

### Batch Processing

- Members are processed in batches (pages from API)
- All members in a batch are processed in parallel using `Promise.all()`
- URL uniqueness is ensured within the batch before saving
- Bulk save operation is used for database efficiency

### Processing Statistics

Each batch returns:

- `totalProcessed`: Total members in the batch
- `totalSaved`: Successfully saved members
- `totalFailed`: Members that failed validation or processing
- `processingTime`: Time taken in milliseconds

---

## Member Visibility

### Visibility Rules

- **`isVisible: true`**: Member is active and visible (actions: `new`, `update`)
- **`isVisible: false`**: Member is dropped/inactive (action: `drop`)

### Drop Action

When a member has action `drop`:

- `isVisible` is set to `false`
- Member is hidden from public-facing features
- Member data remains in database (not deleted)

---

## Edge Cases & Special Scenarios

### Reinstated Members

**Scenario**: Member was previously dropped, now coming back with action `new`

**Behavior**:

- Member exists in database (from previous drop)
- Email may have changed
- Only `email` (loginEmail) is updated, not `contactFormEmail`
- Wix Members Area email is updated
- New member fields are **not** set (member retains existing profile data)

### Members with Non-English Names

**Scenario**: Member name contains non-English characters

**Behavior**:

- URL generation falls back to `'firstNameLastName'`
- This may cause URL conflicts, which are resolved via counter system

### Missing Migration Data

**Scenario**: Member data doesn't include `migrationData` object

**Behavior**:

- Member is still created with core fields
- Default values are used for optional fields
- `optOut` is set to `true` (per requirement)
- No migration-specific fields are set

### Duplicate URLs in Same Batch

**Scenario**: Multiple members in the same page have the same base URL

**Behavior**:

- URLs are deduplicated within the batch
- Counters are assigned sequentially
- Database is checked to ensure no conflicts with existing members

---

## Performance Considerations

### Page Processing Limits

- Maximum pages processed: **1000 pages** (safety limit)
- Pages are processed in parallel (scheduled as separate tasks)
- Each page processes members in bulk for efficiency

### Database Operations

- Bulk save operations are used to minimize database calls
- URL uniqueness checks are performed per batch, not per member
- Email updates for Wix Members Area are batched when possible

---

## Logging & Monitoring

### Key Log Points

- Page scheduling and processing
- URL conflict resolution
- Member validation failures
- Email update operations
- Batch processing statistics

### Error Handling

- Individual member failures don't stop batch processing
- Errors are logged with context (memberId, page number, etc.)
- Processing statistics include failure counts

---

## Change History

### Version 1.1 (January 2026)

- **Correction**: Updated opt-out requirement - should be set to `false` by default (not `true`)

### Version 1.0 (January 2026)

- Initial documentation
- Documented opt-out requirement: set to `false` by default, not from API
- Documented all field handling rules
- Documented new vs existing member logic

---

## Open Questions / Future Considerations

1. **Opt-Out Update for Existing Members**: Should there be a mechanism to update opt-out status for existing members during daily pull? (Currently not supported)

2. **Address Updates**: Should addresses be updated for existing members? (Currently only set for new members)

3. **Display Settings Updates**: Should default display settings be updated for existing members? (Currently only set for new members)

4. **Interests for Other Sites**: Should interests be processed for ASCP, ANP, or AHP sites? (Currently only ABMP)

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative

**Once approved, any changes to these requirements must be documented here with version updates.**
