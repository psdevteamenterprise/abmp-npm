const { contacts } = require('@wix/crm');
const { auth } = require('@wix/essentials');

/**
 * TEST FILE - Multiple approaches to debug contact email updates
 *
 * This file contains different implementations to test and compare
 */

// ============================================================================
// APPROACH 1: Current implementation (from npm package)
// ============================================================================
const elevatedGetContact_v1 = auth.elevate(contacts.getContact);
const elevatedUpdateContact_v1 = auth.elevate(contacts.updateContact);

async function updateContactEmail_v1(contactId, newEmail) {
  console.log(`[TEST V1] Starting - contactId: ${contactId}, email: ${newEmail}`);

  const contact = await elevatedGetContact_v1(contactId);
  console.log(`[TEST V1] Fetched contact:`, contact);

  const updatedInfo = {
    ...contact.info,
    emails: {
      items: [{ email: newEmail, primary: true }],
    },
  };
  console.log(`[TEST V1] Calling updateContact with:`, {
    contactId,
    payload: { info: updatedInfo },
    revision: contact.revision,
  });

  const result = await elevatedUpdateContact_v1(contactId, { info: updatedInfo }, contact.revision);
  console.log(`[TEST V1] Result:`, result);
  return result;
}

// ============================================================================
// APPROACH 2: Old working implementation style
// ============================================================================
async function updateContactEmail_v2(contactId, newEmail) {
  console.log(`[TEST V2] Starting - contactId: ${contactId}, email: ${newEmail}`);

  // Create elevated functions inside the function (like old code)
  const elevatedGetContact = auth.elevate(contacts.getContact);
  const elevatedUpdateContact = auth.elevate(contacts.updateContact);

  const contact = await elevatedGetContact(contactId);
  console.log(`[TEST V2] Fetched contact:`, contact);

  const updatedInfo = {
    ...contact.info,
    emails: {
      items: [{ email: newEmail, primary: true }],
    },
  };
  console.log(`[TEST V2] Calling updateContact with updatedInfo directly (old style):`, {
    contactId,
    payload: updatedInfo,
    revision: contact.revision,
  });

  // Try passing updatedInfo directly (old style)
  const result = await elevatedUpdateContact(contactId, updatedInfo, contact.revision);
  console.log(`[TEST V2] Result:`, result);
  return result;
}

// ============================================================================
// APPROACH 3: Minimal update (only changed fields)
// ============================================================================
async function updateContactEmail_v3(contactId, newEmail) {
  console.log(`[TEST V3] Starting - contactId: ${contactId}, email: ${newEmail}`);

  const elevatedGetContact = auth.elevate(contacts.getContact);
  const elevatedUpdateContact = auth.elevate(contacts.updateContact);

  const contact = await elevatedGetContact(contactId);
  console.log(`[TEST V3] Fetched contact:`, contact);

  // Only send the fields being updated (minimal approach)
  const updatePayload = {
    info: {
      emails: {
        items: [{ email: newEmail, primary: true }],
      },
    },
  };
  console.log(`[TEST V3] Calling updateContact with minimal payload:`, {
    contactId,
    payload: updatePayload,
    revision: contact.revision,
  });

  const result = await elevatedUpdateContact(contactId, updatePayload, contact.revision);
  console.log(`[TEST V3] Result:`, result);
  return result;
}

// ============================================================================
// APPROACH 4: Using revision in options object
// ============================================================================
async function updateContactEmail_v4(contactId, newEmail) {
  console.log(`[TEST V4] Starting - contactId: ${contactId}, email: ${newEmail}`);

  const elevatedGetContact = auth.elevate(contacts.getContact);
  const elevatedUpdateContact = auth.elevate(contacts.updateContact);

  const contact = await elevatedGetContact(contactId);
  console.log(`[TEST V4] Fetched contact:`, contact);

  const updatedInfo = {
    ...contact.info,
    emails: {
      items: [{ email: newEmail, primary: true }],
    },
  };
  console.log(`[TEST V4] Calling updateContact with revision in options:`, {
    contactId,
    payload: { info: updatedInfo },
    options: { revision: contact.revision },
  });

  // Try passing revision as part of an options object
  const result = await elevatedUpdateContact(
    contactId,
    { info: updatedInfo },
    { revision: contact.revision }
  );
  console.log(`[TEST V4] Result:`, result);
  return result;
}

// ============================================================================
// APPROACH 5: Check if elevation is working at all
// ============================================================================
async function testElevation(contactId) {
  console.log(`[TEST ELEVATION] Testing if elevation works at all...`);
  console.log(`[TEST ELEVATION] contactId:`, contactId);

  try {
    // Test 1: Non-elevated getContact (should fail if user doesn't have permission)
    console.log(`[TEST ELEVATION] Test 1: Non-elevated getContact`);
    try {
      const nonElevatedResult = await contacts.getContact(contactId);
      console.log(
        `[TEST ELEVATION] ❓ Non-elevated getContact succeeded (unexpected?):`,
        nonElevatedResult
      );
    } catch (error) {
      console.log(`[TEST ELEVATION] ✓ Non-elevated getContact failed as expected:`, error.message);
    }

    // Test 2: Elevated getContact (should succeed)
    console.log(`[TEST ELEVATION] Test 2: Elevated getContact (module-level)`);
    const elevatedResult = await elevatedGetContact_v1(contactId);
    console.log(`[TEST ELEVATION] ✓ Elevated getContact succeeded:`, elevatedResult);

    // Test 3: Elevated getContact (function-level)
    console.log(`[TEST ELEVATION] Test 3: Elevated getContact (function-level)`);
    const elevatedGetContactLocal = auth.elevate(contacts.getContact);
    const elevatedResultLocal = await elevatedGetContactLocal(contactId);
    console.log(`[TEST ELEVATION] ✓ Elevated getContact (local) succeeded:`, elevatedResultLocal);

    return { success: true };
  } catch (error) {
    console.error(`[TEST ELEVATION] ❌ Error during elevation test:`, error);
    return { success: false, error };
  }
}

// ============================================================================
// Test runner
// ============================================================================
async function runAllTests(contactId, newEmail) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`STARTING CONTACT EMAIL UPDATE TESTS`);
  console.log(`Contact ID: ${contactId}`);
  console.log(`New Email: ${newEmail}`);
  console.log(`${'='.repeat(80)}\n`);

  const results = {
    elevation: null,
    v1: null,
    v2: null,
    v3: null,
    v4: null,
  };

  // Test elevation first
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST: Elevation Check`);
  console.log(`${'='.repeat(80)}`);
  try {
    results.elevation = await testElevation(contactId);
    console.log(`✓ Elevation test completed`);
  } catch (error) {
    console.error(`✗ Elevation test failed:`, error);
    results.elevation = { success: false, error: error.message };
  }

  // Only run update tests if elevation works
  if (results.elevation?.success) {
    // Test V1: Current implementation
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST V1: Current Implementation (wrapped in { info: })`);
    console.log(`${'='.repeat(80)}`);
    try {
      results.v1 = await updateContactEmail_v1(contactId, newEmail);
      console.log(`✓ V1 completed successfully`);
    } catch (error) {
      console.error(`✗ V1 failed:`, error);
      results.v1 = { error: error.message };
    }

    // Test V2: Old style
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST V2: Old Style (direct info object)`);
    console.log(`${'='.repeat(80)}`);
    try {
      results.v2 = await updateContactEmail_v2(contactId, newEmail);
      console.log(`✓ V2 completed successfully`);
    } catch (error) {
      console.error(`✗ V2 failed:`, error);
      results.v2 = { error: error.message };
    }

    // Test V3: Minimal payload
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST V3: Minimal Payload`);
    console.log(`${'='.repeat(80)}`);
    try {
      results.v3 = await updateContactEmail_v3(contactId, newEmail);
      console.log(`✓ V3 completed successfully`);
    } catch (error) {
      console.error(`✗ V3 failed:`, error);
      results.v3 = { error: error.message };
    }

    // Test V4: Revision in options
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST V4: Revision in Options Object`);
    console.log(`${'='.repeat(80)}`);
    try {
      results.v4 = await updateContactEmail_v4(contactId, newEmail);
      console.log(`✓ V4 completed successfully`);
    } catch (error) {
      console.error(`✗ V4 failed:`, error);
      results.v4 = { error: error.message };
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST RESULTS SUMMARY`);
  console.log(`${'='.repeat(80)}`);
  console.log(JSON.stringify(results, null, 2));
  console.log(`${'='.repeat(80)}\n`);

  return results;
}

module.exports = {
  updateContactEmail_v1,
  updateContactEmail_v2,
  updateContactEmail_v3,
  updateContactEmail_v4,
  testElevation,
  runAllTests,
};
