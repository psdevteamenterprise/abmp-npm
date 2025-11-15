# Contact Email Update Investigation - Quick Start

## 🔍 Problem Summary

After migrating to npm package, contact email updates fail silently:

- ✅ Wix DB updates work
- ❌ CRM contact email doesn't update
- ❌ No errors in logs

## 🎯 Key Finding

The old code used `wix-crm.v2` while the new code uses `@wix/crm`. These have **different API signatures**!

**Old (Working)**:

```javascript
elevatedUpdateContact(contactId, infoObject, revision);
```

**New (Not Working?)**:

```javascript
elevatedUpdateContact(contactId, { info: infoObject }, revision);
```

## 🚀 Quick Steps to Investigate

### 1. I've created 4 files for you:

- ✅ `contacts-methods-DEBUG.js` - Your code with extensive logging
- ✅ `contacts-methods-TEST.js` - 4 different API call variations
- ✅ `test-methods.js` - Web methods to run tests
- ✅ `CONTACT_EMAIL_UPDATE_DEBUG.md` - Full documentation

### 2. Release this version to test:

The test methods are already exported in `backend/index.js`.
You just need to:

1. Release new npm version
2. Expose test methods in host site `web-methods.web.js`
3. Run tests from frontend
4. Check logs to see which variation works

### 3. Expose test methods in host site:

Add to `abmp/src/backend/web-methods.web.js`:

```javascript
import {
  // ... your existing imports
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

### 4. Run tests from frontend:

```javascript
import { runContactUpdateTests } from 'backend/web-methods.web';
import wixData from 'wix-data';

// Get your contact ID from member data
const memberData = await wixData.get('Members/PrivateMembersData', 'YOUR_MEMBER_ID');

// Run all test variations
const results = await runContactUpdateTests(memberData.contactId, 'test@newemail.com');

console.log('Results:', results);
// Then check Wix Site Monitoring logs for detailed output
```

### 5. Check which test works:

In Wix Site Monitoring, look for:

- ✅ `[TEST V1]` - Current implementation
- ✅ `[TEST V2]` - Old style (direct info object) ← **Most likely to work**
- ✅ `[TEST V3]` - Minimal payload
- ✅ `[TEST V4]` - Revision in options

### 6. Apply the fix:

Once you know which version works, update `contacts-methods.js` to match that signature.

## 🔧 Most Likely Fix

Based on the code comparison, try this first:

### Change line 23 in `contacts-methods.js`:

**FROM:**

```javascript
await elevatedUpdateContact(contactId, { info: updatedInfo }, contact.revision);
```

**TO:**

```javascript
await elevatedUpdateContact(contactId, updatedInfo, contact.revision);
```

This matches the old working implementation and might be the correct signature for the new package.

## 📖 Full Documentation

See `CONTACT_EMAIL_UPDATE_DEBUG.md` for complete details, analysis, and troubleshooting steps.

## ✅ What's Already Done

- ✅ Debugging files created
- ✅ Test variations created
- ✅ Test methods exported
- ⬜ Release new npm version
- ⬜ Expose in host site
- ⬜ Run tests
- ⬜ Apply fix

Let me know what the tests reveal!
