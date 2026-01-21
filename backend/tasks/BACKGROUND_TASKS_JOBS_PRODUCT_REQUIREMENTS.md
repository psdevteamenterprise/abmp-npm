# Background Tasks & Jobs System - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for the Background Tasks and Jobs System. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The Background Tasks & Jobs System handles scheduled and on-demand background processing tasks for data synchronization, migration, compilation, and maintenance. Tasks are managed using a task manager system that supports scheduling, chunking, parallel processing, and error handling.

---

## Job Scheduler

### Scheduled Jobs

**Product Requirement**: Jobs are scheduled using cron expressions in `jobs.config`.

**Job Configuration File**: `jobs.config`

**Scheduled Jobs**:

1. **`runScheduledTasks`**
   - **Schedule**: Every 5 minutes (`*/5 * * * *`)
   - **Function**: `runScheduledTasks()`
   - **Purpose**: Checks and runs scheduled tasks from task queue
   - **Description**: "Checks and Runs Scheduled Tasks"

2. **`scheduleDailyPullTask`**
   - **Schedule**: Daily at 8:00 AM UTC (`0 8 * * *`)
   - **Function**: `scheduleDailyPullTask(backupDate)`
   - **Purpose**: Schedules daily member data synchronization
   - **Description**: "Schedule Synchronization of all members data daily at 4 AM"
   - **Note**: Cron is UTC, so 8:00 UTC = 4:00 AM EST

3. **`updateSiteMapS3`**
   - **Schedule**: Every 30 minutes (`*/30 * * * *`)
   - **Function**: `updateSiteMapS3()`
   - **Purpose**: Uploads updated sitemap to AWS S3
   - **Description**: "upload an updated sitemap to AWS S3 every 30 minutes"

---

## Task Manager System

### Task Execution

**Product Requirement**: Tasks are executed by the task manager system.

**Task Manager**: `psdev-task-manager` package

**Execution Flow**:

1. `runScheduledTasks()` called every 5 minutes
2. Task manager checks for scheduled tasks
3. Tasks are executed based on their configuration
4. Results are logged and tracked

### Task Configuration

**Product Requirement**: Each task has configuration defining its behavior.

**Configuration Properties**:

1. **`name`**: Task name (from `TASKS_NAMES`)
2. **`getIdentifier`**: Function to generate unique task identifier
3. **`process`**: Function to execute task
4. **`shouldSkipCheck`**: Function to determine if task should be skipped
5. **`estimatedDurationSec`**: Estimated duration in seconds
6. **`scheduleChildrenSequentially`**: (Optional) Whether child tasks run sequentially
7. **`childTasks`**: (Optional) Array of child tasks to schedule

---

## Task Types

### 1. Daily Members Data Sync

**Task Name**: `ScheduleDailyMembersDataSync`

**Product Requirement**: Schedules daily synchronization of all member data from PAC API.

**Process**:

1. Schedules child tasks for each member action type
2. Child tasks: `new`, `update`, `drop` (excludes `none`)
3. Child tasks scheduled in parallel (`scheduleChildrenSequentially: false`)

**Child Tasks**: `ScheduleMembersDataPerAction` (one per action)

**Estimated Duration**: 60 seconds

**Scheduling**:

- Triggered by `scheduleDailyPullTask()` job
- Can accept optional `backupDate` parameter
- If `backupDate` provided: Pulls data from specific backup date

### 2. Schedule Members Data Per Action

**Task Name**: `ScheduleMembersDataPerAction`

**Product Requirement**: Schedules page-by-page synchronization for a specific member action.

**Process**:

1. Fetches first page to determine total pages
2. Schedules tasks for all pages (up to 1000 pages max)
3. Each page processed by `SyncMembers` task

**Data**: `{ action: 'new' | 'update' | 'drop', backupDate?: string }`

**Child Tasks**: `SyncMembers` (one per page)

**Estimated Duration**: 6 seconds

### 3. Sync Members (Page Processing)

**Task Name**: `SyncMembers`

**Product Requirement**: Processes a single page of member data from PAC API.

**Process**:

1. Fetches member data for specific page
2. Filters members by action and site association
3. Processes and saves members in bulk

**Data**: `{ pageNumber: number, action: string, backupDate?: string }`

**Estimated Duration**: 6 seconds

### 4. Schedule Empty About You Members Task

**Task Name**: `scheduleTaskForEmptyAboutYouMembers`

**Product Requirement**: Schedules tasks to convert HTML "About You" content to rich text format.

**Process**:

1. Finds all members with empty `aboutService` (rich text) but with HTML content
2. Chunks members into groups of 1000
3. Schedules `convertHtmlToRichContent` task for each chunk

**Child Tasks**: `convertHtmlToRichContent` (one per chunk)

**Estimated Duration**: 40 seconds

### 5. Convert HTML to Rich Content

**Task Name**: `convertHtmlToRichContent`

**Product Requirement**: Converts HTML "About You" content to Wix rich text format.

**Process**:

1. Receives array of member IDs
2. Processes members in chunks of 30 (concurrent)
3. Converts HTML to rich text for each member
4. Updates member data in database

**Data**: `{ memberIds: string[] }`

**Processing**:

- Chunks of 30 members processed in parallel
- Each member conversion takes ~0.5 seconds
- Results tracked per member (success/failure)

**Estimated Duration**: 45 seconds

### 6. Compile Filters Options

**Task Name**: `CompileFiltersOptions`

**Product Requirement**: Compiles and stores filter options (states, cities, practice areas) for performance.

**Process**:

1. Fetches non-compiled filter data
2. Compiles into optimized format
3. Stores in `COMPILED_STATE_CITY_MAP` collection
4. Stores as single item with ID `'SINGLE_ITEM_ID'`

**Data**: `{ field: 'COMPILED_STATE_LIST' | 'COMPILED_AREAS_OF_PRACTICES' | 'COMPILED_STATE_CITY_MAP' }`

**Fields Compiled**:

- State list
- Practice areas list
- State-city mapping

**Estimated Duration**: 6 seconds

### 7. Schedule External Profile Images Task

**Task Name**: `scheduleTaskForExternalProfileImages`

**Product Requirement**: Schedules tasks to convert external profile images to Wix-hosted images.

**Process**:

1. Finds all members with external (non-Wix) profile images
2. Chunks members into groups
3. Schedules `convertExternalProfilesToWixImages` task for each chunk

**Child Tasks**: `convertExternalProfilesToWixImages` (one per chunk)

**Estimated Duration**: 60 seconds

### 8. Convert External Profiles to Wix Images

**Task Name**: `convertExternalProfilesToWixImages`

**Product Requirement**: Converts external profile image URLs to Wix-hosted images.

**Process**:

1. Receives array of member IDs
2. Downloads external images
3. Uploads to Wix Media Manager
4. Updates member data with Wix image URL

**Data**: `{ memberIds: string[] }`

**Estimated Duration**: 55 seconds

### 9. Update Sitemap S3

**Task Name**: `updateSiteMapS3`

**Product Requirement**: Generates and uploads member sitemap to AWS S3.

**Process**:

1. Queries all members with `showWixUrl === true`
2. Generates XML sitemap
3. Uploads to AWS S3 bucket
4. Bucket name: `{siteAssociation}-sitemap` (e.g., "abmp-sitemap")

**Scheduling**:

- Scheduled every 30 minutes via cron job
- Also can be triggered manually

**Estimated Duration**: 70 seconds

### 10. Schedule Email Sync

**Task Name**: `scheduleEmailSync`

**Product Requirement**: Schedules tasks to sync updated login emails from tracking database.

**Process**:

1. Fetches all updated login emails from `UPDATED_LOGIN_EMAILS` collection
2. Chunks into groups of 500
3. Schedules `syncMemberLoginEmails` task for each chunk

**Child Tasks**: `syncMemberLoginEmails` (one per chunk)

**Estimated Duration**: 30 seconds

### 11. Sync Member Login Emails

**Task Name**: `syncMemberLoginEmails`

**Product Requirement**: Syncs updated login emails to Wix Members Area.

**Process**:

1. Receives array of email update objects
2. Looks up members by memberId
3. Updates Wix member login email via API
4. Tracks success/failure statistics

**Data**: `{ emailUpdates: [{ memberId: string, loginEmail: string }], chunkIndex: number }`

**Processing**:

- Updates Wix Members Area login emails
- Tracks successful and failed updates
- Logs statistics

**Estimated Duration**: 45 seconds

### 12. Schedule Contact Form Email Migration

**Task Name**: `scheduleContactFormEmailMigration`

**Product Requirement**: Schedules tasks to migrate contactFormEmail for members missing it.

**Process**:

1. Finds all members without `contactFormEmail`
2. Chunks into groups of 500
3. Schedules `migrateContactFormEmails` task for each chunk

**Child Tasks**: `migrateContactFormEmails` (one per chunk)

**Estimated Duration**: 30 seconds

### 13. Migrate Contact Form Emails

**Task Name**: `migrateContactFormEmails`

**Product Requirement**: Sets `contactFormEmail` to member's email if missing.

**Process**:

1. Receives array of member IDs
2. For each member:
   - Skip if already has `contactFormEmail`
   - Skip if no `email` field
   - Set `contactFormEmail = email`
3. Bulk save updated members

**Data**: `{ memberIds: string[], chunkIndex: number }`

**Result Tracking**:

- Successful updates
- Failed updates
- Skipped members (already have contactFormEmail or no email)

**Estimated Duration**: 40 seconds

### 14. Schedule URL Migration

**Task Name**: `scheduleMigrateExistingUrls`

**Product Requirement**: Schedules tasks to migrate existing member URLs.

**Process**:

1. Finds all members with existing URLs
2. Chunks into groups
3. Schedules `migrateUrlsChunk` task for each chunk

**Child Tasks**: `migrateUrlsChunk` (one per chunk)

**Estimated Duration**: 80 seconds

### 15. Migrate URLs Chunk

**Task Name**: `migrateUrlsChunk`

**Product Requirement**: Migrates URLs for a chunk of members.

**Data**: Task-specific data structure

**Estimated Duration**: 80 seconds

### 16. Schedule Generate Missing URLs

**Task Name**: `scheduleGenerateMissingUrls`

**Product Requirement**: Schedules tasks to generate URLs for members missing them.

**Process**:

1. Finds all members without URLs
2. Chunks into groups
3. Schedules `generateUrlsChunk` task for each chunk

**Child Tasks**: `generateUrlsChunk` (one per chunk)

**Estimated Duration**: 80 seconds

### 17. Generate URLs Chunk

**Task Name**: `generateUrlsChunk`

**Product Requirement**: Generates unique URLs for a chunk of members.

**Data**: Task-specific data structure

**Estimated Duration**: 80 seconds

### 18. Schedule Create Contacts From Members

**Task Name**: `scheduleCreateContactsFromMembers`

**Product Requirement**: Schedules tasks to create Wix contacts for members missing them.

**Process**:

1. Finds all members without Wix contact IDs
2. Chunks into groups
3. Schedules `createContactsFromMembers` task for each chunk

**Child Tasks**: `createContactsFromMembers` (one per chunk)

**Estimated Duration**: 80 seconds

### 19. Create Contacts From Members

**Task Name**: `createContactsFromMembers`

**Product Requirement**: Creates Wix contacts for a chunk of members.

**Process**:

1. Receives array of member data
2. Creates Wix contacts in parallel
3. Updates member data with contact IDs
4. Bulk saves updated members

**Data**: Task-specific data structure

**Estimated Duration**: 80 seconds

---

## Task Chunking

### Chunking Strategy

**Product Requirement**: Large tasks are broken into smaller chunks for processing.

**Chunk Sizes**:

1. **Member Data Processing**: 1000 members per chunk
2. **Email Updates**: 500 email updates per chunk
3. **Contact Form Migration**: 500 members per chunk
4. **HTML Conversion**: 30 members per chunk (concurrent processing)
5. **Bulk Saves**: 1000 members per chunk (Wix limit)

**Rationale**:

- Prevents timeouts
- Allows parallel processing
- Optimizes database operations
- Respects Wix API limits

---

## Task Identifiers

### Unique Task Identification

**Product Requirement**: Tasks must have unique identifiers to prevent duplicate execution.

**Identifier Generation**:

- Uses `getIdentifier` function in task config
- Can be based on task data
- Prevents same task from running multiple times

**Examples**:

- `task.data` (for action-based tasks)
- `task.data.memberIds` (for member ID-based tasks)
- `task.data.field` (for field-based tasks)
- `'SHOULD_NEVER_SKIP'` (for tasks that should always run)

---

## Task Skipping

### Skip Logic

**Product Requirement**: Tasks can be skipped if already completed or not needed.

**Skip Check**: `shouldSkipCheck()` function

**Current Implementation**:

- All tasks return `false` (never skip)
- Tasks always execute when scheduled

**Future Consideration**:

- Could implement skip logic based on:
  - Task completion status
  - Data state
  - Last execution time

---

## Parallel vs Sequential Execution

### Child Task Execution

**Product Requirement**: Child tasks can execute in parallel or sequentially.

**Configuration**: `scheduleChildrenSequentially`

**Parallel Execution** (`false`):

- All child tasks scheduled at once
- Execute concurrently
- Faster overall completion

**Sequential Execution** (`true`):

- Child tasks execute one after another
- Slower but more controlled
- Useful for dependent tasks

**Current Usage**:

- Daily sync child tasks: Parallel (`false`)
- Other tasks: Default behavior (typically parallel)

---

## Error Handling

### Task Error Handling

**Product Requirement**: Task errors are handled gracefully without stopping other tasks.

**Error Handling**:

- Individual task failures logged
- Errors don't stop other tasks
- Failed tasks can be retried
- Error details logged with context

**Error Logging**:

- Errors logged to console
- Include task name, data, and error message
- Helps with debugging and monitoring

---

## Task Scheduling

### Manual Scheduling

**Product Requirement**: Tasks can be scheduled manually via function calls.

**Manual Scheduling Functions**:

1. **`scheduleDailyPullTask(backupDate)`**:
   - Schedules daily member sync
   - Optional backup date parameter

2. **`scheduleCreateContactsFromMembersTask()`**:
   - Schedules contact creation tasks

3. **`updateSiteMapS3()`**:
   - Schedules sitemap update task

**Usage**:

- Can be called from admin functions
- Can be triggered by events
- Useful for one-time migrations

---

## Data Processing Patterns

### Bulk Processing

**Product Requirement**: Large datasets are processed in bulk for efficiency.

**Bulk Operations**:

- `bulkSaveMembers()`: Saves multiple members at once
- `Promise.all()`: Parallel processing within chunks
- Chunked processing: Prevents timeouts

### Parallel Processing

**Product Requirement**: Independent operations are processed in parallel.

**Parallel Patterns**:

- Multiple members processed concurrently
- Multiple API calls in parallel
- Database queries in parallel

**Example**: HTML to rich content conversion processes 30 members in parallel

---

## Performance Considerations

### Estimated Durations

**Product Requirement**: Each task has estimated duration for scheduling.

**Duration Estimates**:

- Used by task manager for scheduling
- Helps prevent overlapping tasks
- Guides resource allocation

**Current Estimates**:

- Quick tasks: 6-45 seconds
- Medium tasks: 40-60 seconds
- Long tasks: 70-80 seconds

### Chunking for Performance

**Product Requirement**: Tasks are chunked to optimize performance and prevent timeouts.

**Benefits**:

- Prevents function timeouts
- Allows progress tracking
- Enables retry of failed chunks
- Optimizes database operations

---

## Task Dependencies

### Parent-Child Relationships

**Product Requirement**: Some tasks schedule child tasks for processing.

**Parent Tasks**:

- `ScheduleDailyMembersDataSync` → schedules `ScheduleMembersDataPerAction`
- `ScheduleMembersDataPerAction` → schedules `SyncMembers`
- `scheduleTaskForEmptyAboutYouMembers` → schedules `convertHtmlToRichContent`

**Child Task Execution**:

- Can be parallel or sequential
- Parent task completes after scheduling children
- Children execute independently

---

## Data Migration Tasks

### Migration Task Patterns

**Product Requirement**: Migration tasks follow consistent patterns.

**Common Pattern**:

1. **Schedule Task**: Finds members needing migration
2. **Chunk Members**: Groups into manageable chunks
3. **Process Chunk**: Updates members in chunk
4. **Track Results**: Logs success/failure statistics

**Migration Examples**:

- Contact form email migration
- URL migration
- Contact creation
- HTML to rich content conversion

---

## Change History

### Version 1.0 (January 2026)

- Initial documentation
- Documented all task types and their purposes
- Documented job scheduling and cron expressions
- Documented task chunking strategies
- Documented error handling and performance considerations
- Documented task dependencies and execution patterns

---

## Open Questions / Future Considerations

1. **Task Monitoring**: Should there be a dashboard to monitor task execution and status?

2. **Task Retry Logic**: Should failed tasks automatically retry? How many times?

3. **Task Prioritization**: Should tasks have priority levels for execution order?

4. **Task Notifications**: Should administrators be notified of task failures?

5. **Task History**: Should task execution history be stored for auditing?

6. **Task Cancellation**: Should running tasks be cancellable?

7. **Task Progress Tracking**: Should long-running tasks report progress?

8. **Task Dependencies**: Should tasks support explicit dependencies (not just parent-child)?

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative
- [ ] DevOps Team

**Once approved, any changes to these requirements must be documented here with version updates.**
