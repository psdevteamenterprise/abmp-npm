# Contact Email Update Investigation Guide

## Problem Description

Contact email updates in Wix CRM are not working after migration to npm package:

- ✅ Members data in Wix DB updates correctly
- ❌ Contact email in Wix CRM does not update
- ❌ No errors appear in logs
- ✅ Old implementation (before npm) works fine

## Key Differences Found

### OLD Implementation (Working)

```javascript
// From: src/backend/api.web.js (before npm migration)
import { contacts } from 'wix-crm.v2'; // ← Old package
import { elevate } from 'wix-auth'; // ← Old import style

// Elevated functions created INSIDE the function
async function updateContactInfo(contactId, updateInfoCallback, operationName) {
  const elevatedGetContact = elevate(contacts.getContact);
  const elevatedUpdateContact = elevate(contacts.updateContact);

  const currentContact = await elevatedGetContact(contactId);
  const updatedInfo = updateInfoCallback(currentContact.info);

  // Passes updatedInfo DIRECTLY (not wrapped)
  const result = await elevatedUpdateContact(
    contactId,
    updatedInfo, // ← Direct info object
    currentContact.revision
  );
  return result;
}
```

### NEW Implementation (Not Working)

```javascript
// From: abmp-npm/backend/contacts-methods.js
const { contacts } = require('@wix/crm'); // ← New package
const { auth } = require('@wix/essentials'); // ← New import style

// Elevated functions created at MODULE LEVEL
const elevatedGetContact = auth.elevate(contacts.getContact);
const elevatedUpdateContact = auth.elevate(contacts.updateContact);

async function updateContactInfo(contactId, updateInfoCallback, operationName) {
  const contact = await elevatedGetContact(contactId);
  const updatedInfo = updateInfoCallback(contact.info);

  // Wraps updatedInfo in { info: }
  await elevatedUpdateContact(
    contactId,
    { info: updatedInfo }, // ← Wrapped in { info: }
    contact.revision
  );
}
```

## Potential Issues

### 1. Package Change: `wix-crm.v2` → `@wix/crm`

The API signature might have changed between these packages:

- **Old**: `updateContact(contactId, infoObject, revision)`
- **New**: `updateContact(contactId, { info: infoObject }, revision)` or `updateContact(contactId, contactObject, { revision })`

### 2. Elevation Scope

- **Old**: Functions elevated inside the function (per-call elevation)
- **New**: Functions elevated at module level (shared elevation)

This could cause issues with permissions or context.

### 3. Silent Failures

If the CRM update throws an error but it's being caught and not logged, it would appear to work but not actually update.

## Investigation Steps

I've created three debugging files for you:

### File 1: `contacts-methods-DEBUG.js`

This is your current implementation with extensive logging. It will show:

- Every step of the update process
- All data being passed
- Any errors (even if they're being caught)
- Success confirmations

### File 2: `contacts-methods-TEST.js`

This contains 4 different implementations to test:

- **V1**: Current style (wrapped in `{ info: }`)
- **V2**: Old style (direct info object)
- **V3**: Minimal payload (only changed fields)
- **V4**: Revision in options object
- **Elevation Test**: Checks if elevation is working at all

### File 3: `test-methods.js`

Web method wrappers you can call from the frontend to run the tests.

## How to Use

### Step 1: Update Backend Index

Add the test methods to your npm package exports:

```javascript
// In abmp-npm/backend/index.js
module.exports = {
  ...require('./forms-methods'),
  ...require('./search-filters-methods'),
  ...require('./jobs'),
  ...require('./utils'),
  ...require('./daily-pull'),
  ...require('./pac-api-methods'),
  ...require('./members-area-methods'),
  ...require('./members-data-methods'),
  ...require('./cms-data-methods'),
  ...require('./routers-methods'),
  ...require('./test-methods'), // ← Add this
};
```

### Step 2: Expose in Host Site

Add these web methods to your host site:

```javascript
// In abmp/src/backend/web-methods.web.js
import { Permissions, webMethod } from 'wix-web-module';
import {
  // ... existing imports
  runContactUpdateTests as _runContactUpdateTests,
  testContactElevation as _testContactElevation,
  testUpdateMemberContactInfo as _testUpdateMemberContactInfo,
} from 'abmp-npm/backend';

// ... existing exports

export const runContactUpdateTests = webMethod(Permissions.SiteMember, _runContactUpdateTests);

export const testContactElevation = webMethod(Permissions.SiteMember, _testContactElevation);

export const testUpdateMemberContactInfo = webMethod(
  Permissions.SiteMember,
  _testUpdateMemberContactInfo
);
```

### Step 3: Run Tests from Frontend

Option A - Test all variations:

```javascript
import { runContactUpdateTests } from 'backend/web-methods.web';
import wixData from 'wix-data';

// Get your member data (you need the contactId)
const memberData = await wixData.get('Members/PrivateMembersData', 'YOUR_MEMBER_ID');
const contactId = memberData.contactId;

// Run all test variations
const results = await runContactUpdateTests(contactId, 'newemail@test.com');
console.log('Test results:', results);

// Check Wix Site Monitoring logs for detailed output
```

Option B - Test elevation only:

```javascript
import { testContactElevation } from 'backend/web-methods.web';

const results = await testContactElevation(contactId);
console.log('Elevation test results:', results);
```

Option C - Test with DEBUG logging (using your actual saveRegistrationData flow):

```javascript
import { testUpdateMemberContactInfo } from 'backend/web-methods.web';
import wixData from 'wix-data';

// Get existing member data
const existingData = await wixData.get('Members/PrivateMembersData', 'YOUR_MEMBER_ID');

// Create update data (as it would come from your form)
const updateData = {
  ...existingData,
  contactFormEmail: 'newemail@test.com', // Change the email
  firstName: existingData.firstName,
  lastName: existingData.lastName,
};

// Test with DEBUG logging
const results = await testUpdateMemberContactInfo(updateData, existingData);
console.log('Debug test results:', results);

// Check Wix Site Monitoring logs for extensive output
```

### Step 4: Check Logs

Go to your Wix Site Monitoring (Logs) and look for entries starting with:

- `[DEBUG]` - From the debug version
- `[TEST V1]`, `[TEST V2]`, etc. - From different test implementations
- `[TEST ELEVATION]` - From elevation tests
- `[TEST RUNNER]` - From the test runner

## What to Look For

### 1. Elevation Issues

If you see errors like:

- "Insufficient permissions"
- "Unauthorized"
- "Forbidden"

Then elevation is not working correctly.

### 2. API Signature Issues

If you see errors like:

- "Invalid parameter"
- "Expected object of type Contact"
- "Unexpected argument"

Then the API signature has changed between packages.

### 3. Silent Success

If all tests show "success" but the email still doesn't update in CRM:

- Check if the contact actually exists in CRM
- Check if there are any CRM automation rules blocking updates
- Check if the email field is locked/read-only

### 4. Which Version Works

If one of the test versions (V1, V2, V3, V4) works:

- That tells us the correct API signature to use
- Update the actual `contacts-methods.js` to match the working version

## Quick Fix Hypothesis

Based on the code comparison, my best guess is that the issue is with the API call signature. Try this fix first:

### Option 1: Use Old Style (Direct Info Object)

```javascript
// In contacts-methods.js, line 23
// CHANGE FROM:
await elevatedUpdateContact(contactId, { info: updatedInfo }, contact.revision);

// CHANGE TO:
await elevatedUpdateContact(contactId, updatedInfo, contact.revision);
```

### Option 2: Move Elevation Inside Function

```javascript
// In contacts-methods.js
// CHANGE FROM:
const elevatedGetContact = auth.elevate(contacts.getContact);
const elevatedUpdateContact = auth.elevate(contacts.updateContact);

async function updateContactInfo(contactId, updateInfoCallback, operationName) {
  // ...
}

// CHANGE TO:
async function updateContactInfo(contactId, updateInfoCallback, operationName) {
  const elevatedGetContact = auth.elevate(contacts.getContact);
  const elevatedUpdateContact = auth.elevate(contacts.updateContact);
  // ...
}
```

## Next Steps

1. ✅ Add test files to npm package (already created)
2. ⬜ Release new npm version with test methods
3. ⬜ Install new version in host site
4. ⬜ Expose test web methods in host site
5. ⬜ Run tests from frontend
6. ⬜ Check logs to see which version works
7. ⬜ Apply the working solution to the actual code
8. ⬜ Remove test files and release final version

## Need More Help?

If the tests don't reveal the issue, we can:

1. Add even more detailed logging
2. Test with the actual Wix CRM dashboard to verify the contact exists
3. Check if there are any CRM automation rules or webhooks interfering
4. Test with a different contact to rule out data-specific issues
5. Compare the exact bytes being sent in the old vs new implementation

Let me know what the test results show!
