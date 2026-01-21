# Contact Form - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for the Contact Form functionality. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The Contact Form allows site visitors to contact members directly through a lightbox form. The form includes validation, CAPTCHA protection, email automation triggers, and submission tracking. The form is only accessible if the member has enabled their contact form.

---

## Form Access

### Lightbox Display

**Product Requirement**: Contact form is displayed in a lightbox when user clicks "Contact" button on member profile.

**Trigger**:

- "Contact" button on profile page
- Only visible if `member.showContactForm === true`

**Lightbox Name**: `LIGHTBOX_NAMES.CONTACT_US`

**Data Passed**:

- Member profile data passed to lightbox
- Used to identify which member is being contacted

---

## Form Fields

### Required Fields

1. **First Name** (`firstName`)
   - Text input
   - **Required**
   - Validation: Must match `REGEX.NAME` pattern
   - Pattern: `/^[a-zA-Z\s'-]{2,}$/`
   - Minimum 2 characters
   - Allows letters, spaces, hyphens, apostrophes

2. **Last Name** (`lastName`)
   - Text input
   - **Required**
   - Validation: Must match `REGEX.NAME` pattern
   - Same pattern as first name

3. **Email** (`email`)
   - Email input
   - **Required**
   - Validation: Native browser email validation
   - No custom validation (uses built-in email input validation)

4. **Phone** (`phone`)
   - Text input
   - **Required**
   - Validation: US phone number format
   - Uses `phone` library with `country: 'US'`
   - Must be valid US phone number format

5. **Message** (`message`)
   - Text area input
   - **Required**
   - Validation: Must match `REGEX.MESSAGE` pattern
   - Pattern: `/^[A-Za-z0-9\s.,!?'"-]{2,}$/`
   - Minimum 2 characters
   - Allows letters, numbers, spaces, and common punctuation

### CAPTCHA

**Product Requirement**: Form submission requires CAPTCHA verification.

**Implementation**:

- Wix CAPTCHA component (`#captchaInput`)
- Submit button disabled until CAPTCHA verified
- CAPTCHA must be verified before form can be submitted

**CAPTCHA Events**:

- `onVerified`: Called when CAPTCHA is successfully verified
- `onTimeout`: Called when CAPTCHA times out

---

## Form Validation

### Real-Time Validation

**Product Requirement**: Form fields are validated in real-time with custom validation.

**Validation Implementation**:

- Uses `onCustomValidation` for each field
- Validation runs on input/blur
- Invalid fields show error messages
- Submit button state depends on all fields being valid

### Validation Messages

**Error Messages** (from `VALIDATION_MESSAGES.CONTACT_US`):

- First Name: Custom message for invalid first name
- Last Name: Custom message for invalid last name
- Message: Custom message for invalid message
- Phone: Custom message for invalid phone number
- CAPTCHA: Message shown if CAPTCHA not verified

### Submit Button State

**Product Requirement**: Submit button is enabled/disabled based on form validity.

**Button States**:

- **Disabled**:
  - On page load (initial state)
  - When any field is invalid
  - When CAPTCHA is not verified
  - When CAPTCHA times out

- **Enabled**:
  - When all fields are valid
  - AND CAPTCHA is verified

**Validation Check**:

- `validateAllFields()` checks all fields
- Updates validity indication for each field
- Returns `true` only if all fields valid

---

## Form Submission

### Submission Process

**Product Requirement**: Form submission includes validation, data processing, and email automation.

**Submission Flow**:

1. **Pre-Submission Validation**:
   - All fields validated again
   - If invalid: Show error message, prevent submission

2. **Data Collection**:
   - Collect all form field values
   - Format phone number (convert to number)

3. **Backend Submission**:
   - Call `contactSubmission(formData, memberDataId)`
   - Pass form data and member's database ID

4. **Success Handling**:
   - Reset form fields
   - Show success message
   - Form remains open (user can submit another message)

5. **Error Handling**:
   - Show error message
   - Form data preserved (user can retry)

### Submission Data

**Data Sent to Backend**:

```javascript
{
  firstName: string,
  lastName: string,
  email: string,
  phone: string (converted to number),
  message: string
}
```

---

## Backend Processing

### Member Lookup

**Product Requirement**: Member data must be retrieved to process contact submission.

**Lookup**:

- Uses `findMemberByWixDataId(memberDataId)`
- Finds member by Wix data ID (from lightbox context)

### Contact Form Visibility Check

**Product Requirement**: Contact submission is only processed if member has enabled contact form.

**Validation**:

- Check `memberData.showContactForm === true`
- If `false`: Skip submission, log message, return early
- No error shown to user (silent skip)

### Contact Creation

**Product Requirement**: Wix contact must exist for member to receive email automation.

**Logic**:

- Check if `memberData.wixContactId` exists
- If missing:
  - Call `createContactAndMemberIfNew(memberData)`
  - Creates Wix contact for member
  - Stores `wixContactId` in member data

**Rationale**:

- Some members may never have logged in
- They may not have Wix contact ID yet
- Contact is needed for email automation triggers
- Contact is created automatically if missing

### Email Automation

**Product Requirement**: Email automation is triggered when contact form is submitted.

**Automation Trigger**:

- Trigger ID: `AUTOMATION_EMAIL_TRIGGER_ID` from site configs
- Triggered via `triggerAutomation(automationEmailTriggerId, data)`

**Data Passed to Automation**:

```javascript
{
  contactId: string,        // Member's Wix contact ID
  name: string,             // Visitor's full name (firstName + lastName)
  email: string,            // Visitor's email
  phone: string,            // Visitor's phone
  message: string           // Visitor's message
}
```

**Automation Behavior**:

- Sends email to member's `contactFormEmail`
- Email contains visitor's contact information and message
- Member receives notification of contact form submission

### Submission Storage

**Product Requirement**: All contact form submissions are stored in database.

**Collection**: `CONTACT_US_SUBMISSIONS`

**Data Stored**:

```javascript
{
  firstName: string,
  lastName: string,
  email: string,
  phone: number,              // Converted to number
  message: string,
  memberContactId: string,    // Member's Wix contact ID
  memberEmail: string         // Member's contact form email
}
```

**Purpose**:

- Record keeping
- Audit trail
- Potential follow-up processing

---

## Form Reset

### Reset After Submission

**Product Requirement**: Form is reset after successful submission.

**Reset Process**:

- All form fields reset to empty
- Validation indicators reset
- CAPTCHA reset
- Submit button disabled
- User can submit another message

**Reset Method**:

- Uses `reset()` method if available
- Falls back to setting `value = ''`
- Resets validity indication

---

## Success/Error Messages

### Message Display

**Product Requirement**: Success and error messages are displayed to user.

**Message Element**: `#successMessage`

**Display Behavior**:

- Message text set
- Element expanded (shown)
- Auto-collapses after 8 seconds
- User can dismiss manually

### Message Types

1. **Submission Success**:
   - Message: `VALIDATION_MESSAGES.CONTACT_US.SUBMISSION_SUCCESS`
   - Shown after successful submission

2. **Submission Failed**:
   - Message: `VALIDATION_MESSAGES.CONTACT_US.SUBMISSION_FAILED`
   - Shown if backend submission fails

3. **Invalid Fields**:
   - Message: `VALIDATION_MESSAGES.CONTACT_US.INVALID_FIELDS`
   - Shown if validation fails on submit

4. **CAPTCHA Error**:
   - Message: `VALIDATION_MESSAGES.CONTACT_US.CAPTCHA`
   - Shown if CAPTCHA not verified

---

## CAPTCHA Handling

### CAPTCHA Verification

**Product Requirement**: CAPTCHA must be verified before form submission.

**Verification Flow**:

1. **On Verified** (`onVerified`):
   - Validate all form fields
   - If all valid: Enable submit button
   - If invalid: Disable submit button, show CAPTCHA message, reset CAPTCHA

2. **On Timeout** (`onTimeout`):
   - Disable submit button
   - User must verify CAPTCHA again

**Rationale**:

- Prevents spam submissions
- Protects members from abuse
- Ensures human interaction

---

## Member Contact Form Visibility

### Visibility Rules

**Product Requirement**: Contact form is only accessible if member has enabled it.

**Backend Check**:

- `memberData.showContactForm === true`
- Checked before processing submission

**If Disabled**:

- Submission is skipped
- No error shown to user
- Logged: "Member contact form is not enabled for user, skipping contact submission!"

**Rationale**:

- Members can opt out of contact form
- Respects member privacy preferences
- Prevents unwanted contact

---

## Error Handling

### Validation Errors

**Product Requirement**: Validation errors are shown inline.

**Behavior**:

- Invalid fields show error messages
- Error messages from `VALIDATION_MESSAGES.CONTACT_US`
- Fields marked as invalid
- Submit button disabled until all valid

### Submission Errors

**Product Requirement**: Submission errors are handled gracefully.

**Error Scenarios**:

1. **Backend Error**:
   - Error logged to console
   - Error message shown to user
   - Form data preserved (user can retry)

2. **Member Not Found**:
   - Error logged
   - Error message shown to user

3. **Automation Failure**:
   - Submission still stored in database
   - Error logged
   - May or may not show error to user (depends on implementation)

---

## Data Privacy

### Phone Number Formatting

**Product Requirement**: Phone numbers are stored as numbers, not strings.

**Conversion**:

- Phone input value converted to number
- Stored as `Number(data.phone)` in database
- Formatting preserved in display

### Member Email Privacy

**Product Requirement**: Member's contact form email is stored with submission.

**Purpose**:

- Record which email received the notification
- Audit trail
- Potential follow-up processing

**Privacy**:

- Member email not exposed to visitor
- Only used for email automation

---

## Change History

### Version 1.0 (January 2026)

- Initial documentation
- Documented all form fields and validation
- Documented CAPTCHA requirements
- Documented email automation flow
- Documented contact creation logic
- Documented submission storage

---

## Open Questions / Future Considerations

1. **Rate Limiting**: Should there be rate limiting on contact form submissions per visitor?

2. **Email Notifications**: Should visitors receive confirmation emails when they submit?

3. **Auto-Response**: Should there be an automatic response email to visitors?

4. **Spam Filtering**: Should there be additional spam filtering beyond CAPTCHA?

5. **File Attachments**: Should contact form support file attachments?

6. **Submission History**: Should members be able to view their contact form submission history?

7. **Reply Functionality**: Should members be able to reply directly from the submission record?

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative

**Once approved, any changes to these requirements must be documented here with version updates.**
