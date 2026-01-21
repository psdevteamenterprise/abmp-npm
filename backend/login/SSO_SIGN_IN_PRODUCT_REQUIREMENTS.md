# SSO Sign-In Flow - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for the SSO (Single Sign-On) sign-in flow. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The SSO Sign-In Flow enables members to authenticate using a token provided by an external SSO provider (Professional Assist Corp). The flow validates the token, retrieves member data, creates Wix member and contact records if needed, generates a session token, and redirects the user to the members form page.

---

## Flow Overview

### High-Level Flow

1. **User arrives at Loading Page** with SSO token in URL
2. **Frontend extracts token** from URL query parameters
3. **Backend validates token** with SSO provider API
4. **Backend retrieves member data** from database
5. **Backend ensures Wix member/contact exist** (creates if missing)
6. **Backend generates session token** for authenticated user
7. **Frontend applies session token** and stores member ID
8. **User redirected** to Personal Details page

---

## Entry Point

### Loading Page

**Product Requirement**: SSO authentication must be triggered from the Loading Page.

**Implementation**:

- Page: `LoadingPage.js`
- **CRITICAL**: Authentication only runs in browser environment (not SSR/backend)
- Reason: SSO provider API returns 401 error if called from server-side

**Code Location**: `pages/LoadingPage.js`

**Behavior**:

1. Page loads and checks rendering environment
2. If `rendering.env() === 'browser'`:
   - Calls `checkAndLogin(authenticateSSOToken)`
3. If authentication fails:
   - Opens error lightbox: `LOGIN_ERROR_ALERT`
   - Logs error to console

---

## URL Token Parameter

### Token Extraction

**Product Requirement**: SSO token must be provided in URL query parameters.

**Parameter Name**: `token`

**Format**:

- URL: `?token={ssoToken}`
- Token is trimmed of whitespace
- Token is required - if missing, authentication fails

**Example URLs**:

- `https://site.com/loading-page?token=abc123xyz`
- `https://site.com/loading-page?token=abc123xyz&other=param`

---

## Token Validation

### SSO Provider API Call

**Product Requirement**: Token must be validated with external SSO provider before authentication.

**API Endpoint**:

- Base URL: `SSO_TOKEN_AUTH_API_URL` (from config)
- Full URL: `${SSO_TOKEN_AUTH_API_URL}/eweb/SSOToken.ashx?token={token}&Partner=Wix&Signature={signature}`

**Signature Generation**:

- Algorithm: HMAC SHA-256
- Secret Key: `SSO_TOKEN_AUTH_API_KEY` (from Wix Secrets)
- Input: SSO token
- Output: Hexadecimal signature

**Request**:

- Method: GET
- Parameters:
  - `token`: SSO token from URL
  - `Partner`: "Wix" (hardcoded)
  - `Signature`: HMAC SHA-256 signature

**Response**:

- Success: JWT token (text response)
- Failure: Error response or null

**Error Handling**:

- If HTTP response not OK: Returns `null`
- If fetch fails: Returns `null`
- Errors logged to console

---

## JWT Token Decoding

### Token Processing

**Product Requirement**: Valid SSO response contains a JWT token that must be decoded.

**Implementation**:

- Uses `jwt-js-decode` library
- Decodes JWT to extract payload
- Payload contains member information

**Payload Structure**:

```javascript
{
  pac: {
    cst_recno: number  // Member ID (PAC customer record number)
  },
  // ... other fields
}
```

**Validation**:

- Token is valid if:
  - Response is non-null
  - Response is a string
  - Response is non-empty (after trim)

**Error Handling**:

- If token is invalid: Returns error response
- Logs token preview (first 50 characters) for debugging

---

## Member Data Retrieval

### Member Lookup

**Product Requirement**: Member data must be retrieved from database using member ID from JWT payload.

**Member ID Source**: `payload.pac.cst_recno`

**Lookup Method**: `findMemberById(memberId)`

**Validation**:

- Member ID must exist in payload
- Member data must exist in database
- If member not found: Throws error

**Error Messages**:

- Missing member ID: `"Member ID is missing in passed data"`
- Member not found: `"Member data not found for memberId {memberId}"`

---

## Wix Member & Contact Creation

### Ensure Member/Contact Exist

**Product Requirement**: Member must have Wix member ID and contact ID. If missing, they must be created.

**Implementation**: `ensureWixMemberAndContactExist(memberData)`

**Logic**:

1. Check if member has `wixMemberId` and `wixContactId`
2. If both exist: Return member data as-is
3. If either missing: Call `createContactAndMemberIfNew(memberData)`

### Contact & Member Creation

**Product Requirement**: If Wix member or contact doesn't exist, create them using member data.

**Data Used for Creation**:

- `firstName`: Member's first name
- `lastName`: Member's last name
- `email`: Member's email
- `phones`: Member's phone numbers array
- `contactFormEmail`: Member's contact form email (falls back to email)

**Creation Process**:

1. **Wix Member Creation** (if `wixMemberId` missing):
   - Creates site member via Wix Members API
   - Stores returned `wixMemberId` in member data

2. **Wix Contact Creation** (if `wixContactId` missing):
   - Creates site contact via Wix Contacts API
   - Stores returned `wixContactId` in member data
   - `allowDuplicates = false` (default) - prevents duplicate contacts

**Parallel Creation**:

- Both member and contact created in parallel using `Promise.all()`
- Optimizes performance

**Result**:

- Returns member data with `wixMemberId` and `wixContactId` populated
- Member data saved to database with new IDs

---

## Session Token Generation

### Token Generation

**Product Requirement**: A Wix session token must be generated for authenticated members.

**Implementation**:

- Uses Velo `generateSessionToken()` function
- **CRITICAL**: Must use Velo version (not SDK version)
- Reason: SDK version returns 403 error even with valid permissions

**Input**: Member's email address (`memberData.email`)

**Output**: Session token string

**Dependency Injection**:

- `generateSessionToken` is injected via `createLoginMethods()` factory
- Allows using Velo version instead of SDK version

---

## Authentication Response

### Success Response

**Product Requirement**: Successful authentication returns structured response object.

**Response Structure**:

```javascript
{
  type: 'success',
  memberId: string,      // Member's database _id
  sessionToken: string   // Wix session token
}
```

### Error Response

**Product Requirement**: Failed authentication returns error response object.

**Response Structure**:

```javascript
{
  type: 'error',
  memberId: '',
  sessionToken: ''
}
```

**Error Conditions**:

- Invalid SSO token (null or empty response)
- Member not found in database
- Member ID missing from JWT payload
- Any exception during authentication process

---

## Frontend Authentication Application

### Session Token Application

**Product Requirement**: Session token must be applied to establish authenticated session.

**Implementation**:

- Uses `authentication.applySessionToken(sessionToken)`
- Establishes Wix authenticated session
- User is now logged in to Wix site

### Member ID Storage

**Product Requirement**: Member ID must be stored in local storage for later use.

**Implementation**:

- Uses `local.setItem('memberId', memberId)`
- Stores member's database `_id`
- Used by other pages to identify logged-in member

**Parallel Execution**:

- Session token application and member ID storage happen in parallel
- Optimizes performance

---

## Redirect After Authentication

### Redirect Destination

**Product Requirement**: After successful authentication, user must be redirected to Personal Details page.

**Destination Page**: `PAGES_PATHS.MEMBERS_FORM` (from config: `'directory-website-update'`)

**URL Construction**:

- Base path: `/directory-website-update`
- Query parameters:
  - All original query parameters preserved
  - `token` parameter replaced with `memberId` (database `_id`)

**Example**:

- Original: `?token={ssoToken}&other=param`
- Redirect: `/directory-website-update?token={memberId}&other=param`

**Implementation**:

- Uses `wixLocationFrontend.to()` for navigation
- Preserves all query parameters except `token` (which is replaced)

---

## Error Handling

### Authentication Errors

**Product Requirement**: All authentication errors must be handled gracefully.

**Error Scenarios**:

1. **No Token in URL**:
   - Error: `"No authentication token found in URL"`
   - Throws error, caught by error handler

2. **Invalid SSO Token**:
   - SSO provider returns invalid/empty response
   - Returns error response object
   - Frontend throws: `"Authentication failed - invalid response from server"`

3. **Member Not Found**:
   - Member ID from JWT doesn't exist in database
   - Throws error during `prepareMemberForSSOLogin`
   - Caught and logged

4. **Missing Member ID in JWT**:
   - JWT payload doesn't contain `pac.cst_recno`
   - Throws: `"Member ID is missing in passed data"`

5. **SSO API Failure**:
   - HTTP request fails or returns non-OK status
   - Returns `null` from `checkAndFetchSSO`
   - Results in error response

### Error Lightbox

**Product Requirement**: Authentication errors must show user-friendly error message.

**Implementation**:

- Opens lightbox: `LIGHTBOX_NAMES.LOGIN_ERROR_ALERT`
- Lightbox shows error message to user
- User can dismiss and try again

**Error Logging**:

- All errors logged to console with context
- Includes error message and relevant data

---

## Member Token Validation (Post-Login)

### Token Validation Flow

**Product Requirement**: After SSO login, member token (memberId) must be validated on protected pages.

**Implementation**: `validateMemberToken(memberIdInput)`

**Validation Steps**:

1. **Check Token Exists**:
   - If `memberIdInput` is null/undefined: Returns invalid response

2. **Get Current Wix Member**:
   - Uses `getCurrentMember()` from Wix Members API
   - Gets currently authenticated Wix member

3. **Lookup Database Member**:
   - Uses `getCMSMemberByWixMemberId(wixMemberId)`
   - Finds member in database by Wix member ID

4. **Validate Member ID Match**:
   - Compares `memberIdInput` with database member `_id`
   - Must match exactly

5. **Check Member Status**:
   - Member must not be dropped (`action !== 'drop'`)
   - If dropped: Returns invalid response

6. **Enrich Member Data**:
   - Formats membership dates
   - Adds `addressDisplayOption`
   - Adds `isStudent` flag
   - Adds `isSiteAssociation` flag to memberships

**Response Structure**:

```javascript
{
  memberData: Object | null,  // Member data if valid, null if invalid
  isValid: boolean,            // Whether token is valid
  membersExternalPortalUrl: string  // External portal URL from config
}
```

**Invalid Response**:

- Returns `{ memberData: null, isValid: false }` if:
  - Token is missing
  - Wix member not found
  - Database member not found
  - Member IDs don't match
  - Member is dropped

**Error Handling**:

- If database member not found: Throws `CORRUPTED_MEMBER_DATA` error
- Indicates potential data corruption or duplicate members

---

## Security Considerations

### Token Security

**Product Requirement**: SSO tokens must be validated with signature to prevent tampering.

**Implementation**:

- HMAC SHA-256 signature generated using secret key
- Signature verified by SSO provider
- Prevents token manipulation

### Secret Key Management

**Product Requirement**: SSO API key must be stored securely.

**Storage**: Wix Secrets (`getSecret('SSO_TOKEN_AUTH_API_KEY')`)

- Not exposed in code
- Not accessible to frontend
- Only accessible to backend functions

### Session Token Security

**Product Requirement**: Session tokens must be generated securely and applied correctly.

**Implementation**:

- Generated by Wix using member email
- Applied via Wix authentication API
- Establishes secure session

---

## Data Flow

### Complete Data Flow

1. **User arrives** → Loading Page with `?token={ssoToken}`
2. **Frontend** → Extracts token from URL
3. **Frontend** → Calls `authenticateSSOToken({ token })`
4. **Backend** → Generates HMAC signature
5. **Backend** → Calls SSO provider API with token and signature
6. **SSO Provider** → Validates token and signature
7. **SSO Provider** → Returns JWT token
8. **Backend** → Decodes JWT to get payload
9. **Backend** → Extracts member ID from `payload.pac.cst_recno`
10. **Backend** → Looks up member in database by member ID
11. **Backend** → Ensures Wix member/contact exist (creates if needed)
12. **Backend** → Generates session token using member email
13. **Backend** → Returns success response with memberId and sessionToken
14. **Frontend** → Applies session token (establishes session)
15. **Frontend** → Stores memberId in local storage
16. **Frontend** → Redirects to Personal Details page with memberId as token

---

## Member Data Enrichment

### Data Processing

**Product Requirement**: Member data must be enriched with computed properties before use.

**Properties Added**:

1. **`addressDisplayOption`**:
   - Computed from member's address display settings
   - Used for address visibility logic

2. **`isStudent`**:
   - Boolean flag indicating if member is a student
   - Used for UI restrictions (e.g., opt-out disabled)

3. **`memberships`** (formatted):
   - Dates formatted to "Month Year" format
   - `isSiteAssociation` flag added to each membership
   - Indicates which membership is for current site

---

## Browser-Only Execution

### Environment Restriction

**Product Requirement**: SSO authentication must only run in browser environment.

**Reason**: SSO provider API returns 401 Unauthorized if called from server-side (SSR/backend)

**Implementation**:

- Checks `rendering.env() === 'browser'`
- Only executes authentication if in browser
- Prevents server-side execution

**Impact**:

- Loading page must be client-rendered
- Cannot use SSR for SSO authentication flow

---

## Dependency Injection Pattern

### generateSessionToken Injection

**Product Requirement**: `generateSessionToken` must be injected as dependency.

**Reason**:

- SDK version (`@wix/identity`) returns 403 error
- Velo version works correctly
- Dependency injection allows using Velo version

**Implementation**:

- `createLoginMethods(generateSessionToken)` factory function
- Injects Velo `generateSessionToken` into login methods
- Methods receive `generateSessionToken` as parameter

**Usage**:

```javascript
const loginMethods = createLoginMethods(generateSessionToken);
const authResult = await loginMethods.authenticateSSOToken({ token });
```

---

## Change History

### Version 1.0 (January 2026)

- Initial documentation
- Documented complete SSO authentication flow
- Documented token validation and signature generation
- Documented member/contact creation logic
- Documented session token generation and application
- Documented error handling and security considerations
- Documented browser-only execution requirement
- Documented dependency injection pattern

---

## Open Questions / Future Considerations

1. **Token Expiration**: Should SSO tokens have expiration handling? Currently no expiration check.

2. **Token Refresh**: Should there be a mechanism to refresh expired tokens?

3. **Multiple SSO Providers**: Should the system support multiple SSO providers? Currently only Professional Assist Corp.

4. **Error Recovery**: Should there be retry logic for transient SSO API failures?

5. **Token Caching**: Should validated tokens be cached to reduce API calls?

6. **Audit Logging**: Should SSO login attempts be logged for security auditing?

7. **Rate Limiting**: Should there be rate limiting on SSO authentication attempts?

8. **Token Revocation**: Should there be a mechanism to revoke active SSO tokens?

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative
- [ ] Security Team

**Once approved, any changes to these requirements must be documented here with version updates.**
