# QA Login Flow - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for the QA (Quality Assurance) Login Flow. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The QA Login Flow enables authorized QA users to authenticate and access the system for testing purposes. It uses email-based authentication with a shared secret key, allowing QA team members to log in as any member for testing without requiring SSO tokens.

---

## Entry Point

### QA Page

**Product Requirement**: QA authentication is triggered from the QA Page.

**Page**: `QAPage.js`

**URL Parameters Required**:

- `userEmail`: Email of the member to log in as
- `secret`: Shared secret key for QA authentication
- `redirectTo`: (Optional) Page to redirect to after login
- Other query parameters: Preserved and passed to redirect URL

---

## URL Parameters

### Required Parameters

1. **`userEmail`** (required)
   - Email address of the member to log in as
   - Must exist in QA users list
   - Must match a member in the database

2. **`secret`** (required)
   - Shared secret key for QA authentication
   - Must match `ABMP_QA_SECRET` from Wix Secrets
   - Same secret for all QA users

### Optional Parameters

3. **`redirectTo`** (optional)
   - Page path to redirect to after successful login
   - If not provided, redirects to home page (`/`)
   - Example: `directory-website-update`

4. **Other Parameters** (optional)
   - Any additional query parameters are preserved
   - Passed to redirect URL after login
   - Useful for passing context to target page

---

## User Validation

### QA User List

**Product Requirement**: Email must be in the approved QA users list.

**Validation Method**: `validateQAUser(userEmail)`

**Data Source**: `getQAUsers()`

**Collection**: `COLLECTIONS.QA_USERS`

**Validation Logic**:

1. Fetch all QA users from database
2. Find user with matching email
3. If found: Return `{ valid: true, email: matchingEmail }`
4. If not found: Return `{ error: "Invalid user email: {userEmail}" }`

**Error Handling**:

- Invalid email returns error response
- Login process stops
- Error message returned to frontend

---

## Secret Validation

### Secret Key Check

**Product Requirement**: Secret key must match the stored QA secret.

**Secret Source**: `ABMP_QA_SECRET` from Wix Secrets

**Validation**:

- Compare provided `secret` with stored secret
- Must match exactly (case-sensitive)
- If mismatch: Return error response

**Error Response**:

- `{ success: false, error: 'Invalid secret' }`
- Login process stops

**Security**:

- Secret stored in Wix Secrets (not in code)
- Only accessible to backend functions
- Same secret used for all QA users

---

## Member Lookup

### Member Data Retrieval

**Product Requirement**: Member data must be retrieved using validated email.

**Lookup Method**: `prepareMemberForQALogin(email)`

**Process**:

1. Validate email is not empty
2. Lookup member by email: `getMemberByEmail(email)`
3. If member not found: Throw error
4. Ensure Wix member/contact exist (create if missing)
5. Return member data with Wix IDs

**Error Handling**:

- Missing email: `"Email is missing in passed data"`
- Member not found: `"Member data not found for email {email}"`
- Errors logged with context

---

## Wix Member & Contact Creation

### Ensure Member/Contact Exist

**Product Requirement**: Member must have Wix member ID and contact ID for authentication.

**Implementation**: `ensureWixMemberAndContactExist(memberData)`

**Logic**:

- If `wixMemberId` and `wixContactId` exist: Return as-is
- If either missing: Call `createContactAndMemberIfNew(memberData)`
- Creates Wix member and contact if needed

**Rationale**:

- Session token requires Wix member
- Some members may not have logged in yet
- QA login creates necessary records automatically

---

## Session Token Generation

### Token Generation

**Product Requirement**: A Wix session token must be generated for authenticated QA users.

**Implementation**:

- Uses Velo `generateSessionToken()` function
- **CRITICAL**: Must use Velo version (not SDK version)
- Reason: SDK version returns 403 error even with valid permissions

**Input Parameters**:

- `email`: Member's email address
- `qaSecret`: QA secret key (passed as second parameter)

**Output**: Session token string

**Dependency Injection**:

- `generateSessionToken` is injected via `createLoginMethods()` factory
- Allows using Velo version instead of SDK version

---

## Authentication Response

### Success Response

**Product Requirement**: Successful authentication returns structured response.

**Response Structure**:

```javascript
{
  success: true,
  token: string,           // Wix session token
  memberCMSId: string      // Member's database _id
}
```

### Error Response

**Product Requirement**: Failed authentication returns error response.

**Response Structure**:

```javascript
{
  success: false,
  error: string            // Error message
}
```

**Error Scenarios**:

- Invalid user email: `"Invalid user email: {userEmail}"`
- Invalid secret: `"Invalid secret"`
- Member not found: Error from `prepareMemberForQALogin`
- Token generation failure: `"Failed to generate session token"`

---

## Frontend Authentication Application

### Session Token Application

**Product Requirement**: Session token must be applied to establish authenticated session.

**Implementation**:

- Uses `authentication.applySessionToken(token)`
- Establishes Wix authenticated session
- User is now logged in to Wix site

### Member ID Storage

**Product Requirement**: Member ID must be stored in local storage.

**Implementation**:

- Uses `local.setItem('memberId', memberCMSId)`
- Stores member's database `_id`
- Used by other pages to identify logged-in member

---

## Redirect After Authentication

### Redirect Destination

**Product Requirement**: After successful authentication, user is redirected to specified page.

**Redirect Logic**:

1. If `redirectTo` parameter exists:
   - Redirect to `/{redirectTo}?{queryParams}`
   - Preserves all query parameters (except `userEmail`, `secret`, `redirectTo`)

2. If `redirectTo` not provided:
   - Redirect to home page: `/`
   - Preserves query parameters

**Query Parameters**:

- Original query parameters preserved
- `token` parameter added with `memberCMSId`
- `userEmail`, `secret`, `redirectTo` removed from URL

**Example**:

- Original: `?userEmail=test@example.com&secret=abc123&redirectTo=directory-website-update&other=param`
- Redirect: `/directory-website-update?token={memberCMSId}&other=param`

---

## Error Handling

### Validation Errors

**Product Requirement**: Validation errors are handled and displayed to user.

**Error Scenarios**:

1. **Missing Parameters**:
   - Error: `"Missing required parameters: userEmail and/or secret"`
   - Thrown if `userEmail` or `secret` is missing
   - Displayed on QA page

2. **Invalid User Email**:
   - Error: `"Invalid user email: {userEmail}"`
   - Email not in QA users list
   - Displayed on QA page

3. **Invalid Secret**:
   - Error: `"Invalid secret"`
   - Secret doesn't match stored secret
   - Displayed on QA page

4. **Member Not Found**:
   - Error: `"Member data not found for email {email}"`
   - Email doesn't match any member
   - Displayed on QA page

5. **Login Failure**:
   - Error: `"Login failed"` or specific error message
   - Generic error for other failures
   - Displayed on QA page

### Error Display

**Product Requirement**: Errors are displayed on QA page.

**Implementation**:

- Error message displayed in `#qaText` element
- Format: `"Login failed: {error message}"`
- User can see what went wrong
- User can retry with corrected parameters

---

## Security Considerations

### Secret Key Management

**Product Requirement**: QA secret key must be stored securely.

**Storage**: Wix Secrets (`ABMP_QA_SECRET`)

- Not exposed in code
- Not accessible to frontend
- Only accessible to backend functions

### User Email Validation

**Product Requirement**: Only approved QA users can authenticate.

**Validation**:

- Email must be in `QA_USERS` collection
- Prevents unauthorized access
- Allows controlled access for testing

### Session Token Security

**Product Requirement**: Session tokens must be generated securely.

**Implementation**:

- Generated by Wix using member email and secret
- Applied via Wix authentication API
- Establishes secure session

---

## QA Users Management

### QA Users Collection

**Product Requirement**: QA users are stored in database collection.

**Collection**: `COLLECTIONS.QA_USERS`

**Structure**:

- Each QA user has email field
- List of approved QA team member emails
- Can be updated by administrators

**Usage**:

- Validates if email is approved for QA login
- Prevents unauthorized QA access
- Allows adding/removing QA users

---

## Use Cases

### Primary Use Cases

1. **Testing Member Features**:
   - QA team logs in as specific members
   - Tests member-specific functionality
   - Verifies member data display

2. **Testing Personal Details Page**:
   - QA team tests form functionality
   - Verifies data saving
   - Tests validation rules

3. **Testing Profile Pages**:
   - QA team views member profiles
   - Verifies profile data display
   - Tests contact form functionality

4. **Testing Search Functionality**:
   - QA team tests search filters
   - Verifies search results
   - Tests pagination

---

## Differences from SSO Login

### Key Differences

1. **Authentication Method**:
   - SSO: External token validation
   - QA: Email + secret validation

2. **User Selection**:
   - SSO: User is determined by token
   - QA: User is specified via `userEmail` parameter

3. **Access Control**:
   - SSO: Any member with valid token
   - QA: Only approved QA users + valid secret

4. **Use Case**:
   - SSO: Production member login
   - QA: Testing and development

---

## Change History

### Version 1.0 (January 2026)

- Initial documentation
- Documented QA authentication flow
- Documented user and secret validation
- Documented member lookup and contact creation
- Documented session token generation
- Documented redirect behavior
- Documented error handling
- Documented security considerations

---

## Open Questions / Future Considerations

1. **QA User Management**: Should there be an admin interface to manage QA users?

2. **Secret Rotation**: Should QA secret be rotated periodically for security?

3. **Audit Logging**: Should QA login attempts be logged for security auditing?

4. **Rate Limiting**: Should there be rate limiting on QA login attempts?

5. **IP Restrictions**: Should QA login be restricted to specific IP addresses?

6. **Session Duration**: Should QA sessions have different duration than production sessions?

7. **Multi-Site Support**: Should QA secret be different per site, or shared across sites?

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative
- [ ] QA Team Lead
- [ ] Security Team

**Once approved, any changes to these requirements must be documented here with version updates.**
