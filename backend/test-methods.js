/**
 * DEBUG WEB METHOD
 *
 * Instructions for use:
 *
 * 1. Import this in your host site's web-methods.web.js:
 *    import { runContactUpdateTests, testContactElevation } from 'abmp-npm/backend/test-methods';
 *    import { Permissions, webMethod } from 'wix-web-module';
 *
 *    export const runContactUpdateTests = webMethod(Permissions.SiteMember, _runContactUpdateTests);
 *    export const testContactElevation = webMethod(Permissions.SiteMember, _testContactElevation);
 *
 * 2. Call from frontend console or page code:
 *    import { runContactUpdateTests } from 'backend/web-methods.web';
 *
 *    // Get your contactId from your member data
 *    const results = await runContactUpdateTests('YOUR_CONTACT_ID', 'newemail@test.com');
 *    console.log('Test results:', results);
 *
 * 3. Check the Wix logs (Site Monitoring) for detailed output
 */

const { updateMemberContactInfo } = require('./contacts-methods-DEBUG');
const { runAllTests, testElevation } = require('./contacts-methods-TEST');

/**
 * Run all contact update test variations
 */
async function runContactUpdateTests(contactId, newEmail) {
  console.log(`[TEST RUNNER] Starting tests for contactId: ${contactId}, email: ${newEmail}`);

  if (!contactId) {
    throw new Error('contactId is required');
  }

  if (!newEmail) {
    throw new Error('newEmail is required');
  }

  try {
    const results = await runAllTests(contactId, newEmail);
    return {
      success: true,
      message: 'Tests completed - check logs for details',
      results,
    };
  } catch (error) {
    console.error(`[TEST RUNNER] Error:`, error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
}

/**
 * Test if elevation is working correctly
 */
async function testContactElevation(contactId) {
  console.log(`[TEST RUNNER] Testing elevation for contactId: ${contactId}`);

  if (!contactId) {
    throw new Error('contactId is required');
  }

  try {
    const results = await testElevation(contactId);
    return {
      success: true,
      message: 'Elevation test completed - check logs for details',
      results,
    };
  } catch (error) {
    console.error(`[TEST RUNNER] Error:`, error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
}

/**
 * Test the debug version of updateMemberContactInfo
 */
async function testUpdateMemberContactInfo(data, existingMemberData) {
  console.log(`[TEST RUNNER] Testing updateMemberContactInfo with DEBUG logging`);

  if (!data) {
    throw new Error('data is required');
  }

  if (!existingMemberData) {
    throw new Error('existingMemberData is required');
  }

  try {
    await updateMemberContactInfo(data, existingMemberData);
    return {
      success: true,
      message: 'updateMemberContactInfo completed - check logs for details',
    };
  } catch (error) {
    console.error(`[TEST RUNNER] Error:`, error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
}

module.exports = {
  runContactUpdateTests,
  testContactElevation,
  testUpdateMemberContactInfo,
};
