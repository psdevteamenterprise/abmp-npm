# Personal Details Page - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for the Personal Details page. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The Personal Details page is a member-facing form that allows members to update their profile information, business details, contact information, and gallery images. The page is organized into multiple sections with independent save functionality, real-time validation, and unsaved changes tracking.

---

## Authentication & Authorization

### Access Control

**Product Requirement**: The page requires a valid member token to access.

**Implementation**:

- Token is passed via URL query parameter: `?token={memberTokenId}`
- Token is validated via `validateMemberToken()` backend method
- If token is missing or invalid, page shows "Unauthorized" state
- If validation fails (error), page shows "Error" state

**Student Members**:

- Student members have restricted access to opt-out functionality
- Directory opt-out checkbox is **disabled** for students
- Checkbox is visually styled as disabled
- Checkbox value is forced to `false` (not opted out) for students

---

## Page States

### Main State Box States

1. **`loading`**: Initial state while validating token and loading member data
2. **`formState`**: Main form state - displayed after successful authentication
3. **`unauthorizedState`**: Shown when token is missing or invalid
4. **`errorState`**: Shown when token validation fails with an error

---

## Form Sections

The page is divided into **5 independent sections**, each with its own change tracking:

1. **Personal Details** (`personal`)
2. **Business & Services** (`businessServices`)
3. **Contact & Booking** (`contactBooking`)
4. **Directory Opt-Out** (`directoryOptOut`)
5. **Website Opt-Out** (`websiteOptOut`)

### Section Independence

- Each section tracks changes independently
- Save buttons are enabled/disabled per section based on changes
- Unsaved changes in any section trigger a warning when navigating away

---

## Personal Details Section

### Fields

1. **First Name** (`firstName`)
   - Required field
   - Text input
   - Validated: Must be valid (non-empty)

2. **Last Name** (`lastName`)
   - Required field
   - Text input
   - Validated: Must be valid (non-empty)

3. **URL Slug** (`url`)
   - Text input
   - **Real-time validation** (debounced 800ms)
   - Format requirements:
     - Length: 3-50 characters
     - Pattern: `^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$`
     - Must start and end with alphanumeric
     - Can contain dashes in the middle
   - Uniqueness check: Validated against database (excluding current member)
   - Validation messages:
     - Invalid format: "Enter a valid URL. You can use letters, numbers or dashes."
     - Taken: "Enter a new URL slug. This one is already taken."
     - Error: "There was an error. Please try again."
   - If unchanged from original, considered valid (no uniqueness check needed)
   - Profile link updates automatically when slug changes

4. **Profile Link**
   - Display-only field
   - Format: `{baseUrl}/profile/{url}`
   - Opens in new tab when clicked
   - Updates automatically when slug is saved

5. **License Numbers**
   - Display-only field
   - Shows comma-separated list of license numbers from `licenses` array
   - Format: `license1, license2, ...`

6. **Directory Opt-Out Checkbox** (`optOut`)
   - Checkbox (inverted logic: checked = not opted out)
   - **Disabled for student members**
   - Requires confirmation when unchecking (opting out)
   - Opens confirmation lightbox when user tries to opt out
   - Saves immediately upon confirmation

7. **Website Opt-Out Checkbox** (`showWixUrl`)
   - Checkbox (checked = show website URL)
   - Requires confirmation when unchecking (opting out)
   - Opens confirmation lightbox when user tries to opt out
   - Saves immediately upon confirmation
   - When enabled, shows text: "This is the default and will auto-populate with the information entered on this page."
   - When disabled, shows text: "To deactivate, please opt in via Personal Details."

### Save Behavior

- **Save Button**: "Save Personal Details"
- Only enabled when:
  - Form data has changed
  - First name is valid
  - Last name is valid
  - URL slug is valid (format + uniqueness)
- Saves only personal fields (partial update):
  - `firstName`
  - `lastName`
  - `fullName` (auto-generated)
  - `url`
- Profile link updates after successful save

---

## Business & Services Section

### Fields

1. **Business Name Checkbox** (`showBusinessName`)
   - Checkbox to show/hide business name on profile

2. **Business Name Input** (`businessName`)
   - Text input
   - Optional field
   - Display text shows "Business name not provided" if empty

3. **Year Joined Checkbox** (`showABMP`)
   - Checkbox to show/hide "Member Since" year on profile
   - Year is derived from `memberships` array (site association membership)

4. **Year Joined Text**
   - Display-only field
   - Shows year from `memberships[].membersince` where `isSiteAssociation === true`
   - Shows "Year joined not provided" if not available

5. **About Service** (`aboutService`)
   - Text area input
   - Optional field

6. **Profile Image** (`profileImage`)
   - Image upload button
   - **Only displays Wix-hosted images** (external URLs are not shown)
   - Can upload new image
   - Can delete existing image (with confirmation)
   - Shows image name (truncated if > 23 chars)

7. **Logo Image** (`logoImage`)
   - Image upload button
   - Can upload new image
   - Can delete existing image (with confirmation)
   - Shows image name

8. **Banner Image** (`bannerImages`)
   - Array of images (currently supports single image)
   - Can upload via button or lightbox selector
   - Can delete existing image (with confirmation)
   - Shows image name

9. **Areas of Practice** (`areasOfPractices`)
   - Multi-select service/interests
   - Searchable input with dropdown
   - Can type to search (debounced 250ms)
   - Can press Enter to add custom value (if not in list)
   - Can select from dropdown list
   - Can remove selected services
   - Maximum: No explicit limit (but UI may have practical limits)
   - Stored as array of strings

10. **Testimonials** (`testimonial`)
    - Array of text testimonials
    - Can add new testimonial
    - Can delete existing testimonial (with confirmation)
    - Stored as array of strings

### Save Behavior

- **Save Button**: "Save Business & Services"
- Only enabled when form data has changed
- Saves only business fields (partial update):
  - `showBusinessName`
  - `businessName`
  - `showABMP`
  - `aboutService`
  - `profileImage`
  - `logoImage`
  - `bannerImages` (array)
  - `areasOfPractices` (array)
  - `testimonial` (array)

---

## Contact & Booking Section

### Fields

1. **Show Contact Form Checkbox** (`showContactForm`)
   - Checkbox to enable/disable contact form on profile

2. **Contact Form Email** (`contactFormEmail`)
   - Email input
   - Required if contact form is enabled
   - Validated: Must be valid email format

3. **Scheduling Link** (`bookingUrl`)
   - URL input
   - Optional field
   - Custom validation: Must be valid URL format (if provided)
   - URL validation regex: `/^(https?:\/\/|www\.)([da-z.-]+)\.([a-z.]{2,})([/\w .-]*)*(\?[&\w=.-]*)?(#[&\w=.-]*)?\/?$/`
   - Empty URLs are considered valid (optional field)

4. **Website URL** (`website`)
   - URL input
   - Optional field
   - Custom validation: Must be valid URL format (if provided)
   - Enabled/disabled based on checkbox selection (see below)

5. **Show Wix URL Checkbox** (`showWixUrl`)
   - Checkbox to show Wix-generated profile URL
   - When checked:
     - Website URL input is **disabled**
     - Profile URL text is highlighted
   - When unchecked:
     - Website URL input is **enabled** (if "Show Existing URL" is checked)
     - Profile URL text is not highlighted

6. **Show Existing URL Checkbox** (`showWebsite`)
   - Checkbox to show custom website URL
   - When checked:
     - Website URL input is **enabled**
     - "Show Wix URL" checkbox is unchecked
   - When unchecked:
     - Website URL input is **disabled**
   - Mutually exclusive with "Show Wix URL"

7. **Profile URL Text**
   - Display-only field
   - Shows: `{baseUrl}/profile/{url}`
   - Highlighted when "Show Wix URL" is checked

8. **Addresses** (`addresses` + `addressDisplayOption`)
   - Repeater with address items
   - **Maximum: 10 addresses**
   - Each address has:
     - **Main Address Checkbox**: Marks address as primary
       - **CRITICAL**: Main address **cannot be unchecked**
       - If user tries to uncheck main address, checkbox is reverted and error lightbox is shown
       - Only one address can be main at a time
     - **Address Status Dropdown**: Controls visibility
       - Options: Full Address, State/City/Zip, Don't Show
       - **CRITICAL**: Main address **cannot be set to "Don't Show"**
       - If user tries to set main address to "Don't Show", it reverts to "State/City/Zip"
     - **Edit Button**: Opens address in edit mode
     - **Delete Button**: Removes address (with confirmation)
   - Address fields:
     - Street address (line1)
     - Apartment/Building (line2)
     - City
     - State
     - Postal code
     - Country (default: US)
     - Latitude/Longitude (from address input component)
   - Address validation (when editing):
     - Street name required
     - Street number required
     - City required
     - State required
     - Postal code required
     - Valid location (latitude/longitude) required
   - New addresses start in edit mode
   - Address display options stored in `addressDisplayOption` array:
     - Each option has `key` (address key) and `isMain` boolean

9. **Phone Numbers** (`phones` + `toShowPhone`)
   - Repeater with phone items
   - **Maximum: 10 phone numbers**
   - Each phone has:
     - **Phone Input**: Text input for phone number
     - **Show Phone Checkbox**: Marks phone as visible on profile
       - Only one phone can be marked as "show" at a time
     - **Remove Button**: Deletes phone (with confirmation)
   - The phone marked with "Show Phone" is stored in `toShowPhone` field
   - Phones are stored as array of strings in `phones` field

### Save Behavior

- **Save Button**: "Save Contact & Booking"
- Only enabled when:
  - Form data has changed
  - Contact form email is valid (if contact form is enabled)
  - Scheduling link URL is valid (if provided)
  - Website URL is valid (if provided)
- Saves only contact fields (partial update):
  - `showContactForm`
  - `contactFormEmail`
  - `toShowPhone`
  - `bookingUrl`
  - `website`
  - `showWebsite`
  - `showWixUrl`
  - `addresses` (array)
  - `addressDisplayOption` (array)
  - `phones` (array)

---

## Gallery Section

### Features

1. **Image Gallery** (`gallery`)
   - Array of images
   - Each image has `src` property (URL)
   - Can upload new images via button
   - Can delete existing images (with confirmation)
   - Images are saved immediately upon upload/delete (no separate save button)
   - Gallery updates in real-time

### Save Behavior

- **No save button** - saves automatically
- Saves only `gallery` field (partial update)
- Saves immediately after:
  - Image upload
  - Image deletion

---

## Opt-Out Confirmations

### Directory Opt-Out Confirmation

**Product Requirement**: When user unchecks the directory opt-out checkbox (opting out), a confirmation lightbox must be shown.

**Flow**:

1. User unchecks checkbox
2. Checkbox is disabled and styled as disabled
3. Confirmation box expands
4. User can:
   - Click "Yes" to confirm → Saves `optOut: true`, collapses box, enables checkbox
   - Click "Cancel" → Reverts checkbox to checked, collapses box, enables checkbox

### Website Opt-Out Confirmation

**Product Requirement**: When user unchecks the website opt-out checkbox (opting out), a confirmation lightbox must be shown.

**Flow**:

1. User unchecks checkbox
2. Checkbox is disabled and styled as disabled
3. Confirmation box expands
4. User can:
   - Click "Yes" to confirm → Saves `showWixUrl: false`, collapses box, enables checkbox, updates related checkboxes
   - Click "Cancel" → Reverts checkbox to checked, collapses box, enables checkbox

**Additional Behavior**:

- When `showWixUrl` is set to `true`:
  - If "Show Existing URL" is not checked, "Show Wix URL" checkbox is checked and enabled
- When `showWixUrl` is set to `false`:
  - "Show Wix URL" checkbox is unchecked and disabled

---

## Unsaved Changes Tracking

### Product Requirement

**When user tries to navigate away with unsaved changes, show a warning lightbox.**

**Implementation**:

- Each form section tracks its own "has unsaved changes" state
- "Go Back" button checks all sections for unsaved changes
- If any section has unsaved changes:
  - Opens "Save Alert" lightbox
  - Lightbox shows warning message
  - User can choose to stay or leave
- If no unsaved changes:
  - Navigates immediately to members external portal URL

---

## Address Management

### Main Address Rules

**CRITICAL REQUIREMENTS**:

1. **Main Address Cannot Be Unchecked**
   - If user tries to uncheck the main address checkbox, the action is prevented
   - Checkbox is reverted to checked
   - Error lightbox "mainAddressError" is shown
   - Message: "Primary address required"

2. **Main Address Cannot Be Hidden**
   - If user tries to set main address status to "Don't Show", the action is prevented
   - Status reverts to "State/City/Zip"
   - No error message shown (silent revert)

3. **Only One Main Address**
   - When a new address is marked as main, all other addresses are unmarked
   - Stored in `addressDisplayOption` array with `isMain: true` for selected address

### Address Status Options

1. **Full Address** (`full_address`): All address details visible
2. **State/City/Zip** (`state_city_zip`): Only state, city, and zip visible (default)
3. **Don't Show** (`dont_show`): Address completely hidden

### Address Validation

When editing an address, the following fields are required:

- Street name
- Street number
- City
- State
- Postal code
- Valid location (latitude/longitude from address input component)

If validation fails:

- Error message is shown
- Save button is disabled
- Address cannot be saved until all fields are valid

---

## Phone Management

### Show Phone Rules

**Product Requirement**: Only one phone number can be marked as "show" at a time.

**Implementation**:

- When a phone's "Show Phone" checkbox is checked:
  - All other phone checkboxes are unchecked
  - The selected phone number is stored in `toShowPhone` field
- When a phone's "Show Phone" checkbox is unchecked:
  - `toShowPhone` is set to `null`
  - No phone is marked as visible

---

## Image Upload & Management

### Image Types

1. **Profile Image**
   - **Special Rule**: Only displays if image is Wix-hosted
   - External URLs are not shown in the UI
   - Can upload new image
   - Can delete existing image

2. **Logo Image**
   - Can upload new image
   - Can delete existing image

3. **Banner Image**
   - Can upload via button or lightbox selector
   - Can delete existing image
   - Currently supports single image (stored as array)

4. **Gallery Images**
   - Can upload multiple images
   - Can delete individual images
   - Saves immediately (no separate save button)

### Image Deletion

- All image deletions require confirmation
- Opens "deleteConfirm" lightbox
- User must confirm before deletion
- After confirmation, image is removed from data and UI updates

---

## URL Validation

### URL Format Validation

**Product Requirement**: URLs must be valid format if provided (optional fields).

**Validation Rules**:

- Empty URLs are considered valid (optional fields)
- URL must start with:
  - `http://` or `https://` OR
  - `www.`
- Must contain valid domain structure
- Supports query parameters and fragments
- Regex: `/^(https?:\/\/|www\.)([da-z.-]+)\.([a-z.]{2,})([/\w .-]*)*(\?[&\w=.-]*)?(#[&\w=.-]*)?\/?$/`

**Applied To**:

- Scheduling Link (`bookingUrl`)
- Website URL (`website`)

**Error Message**: "Please enter a valid URL"

---

## Slug (URL) Validation

### Format Requirements

- **Length**: 3-50 characters
- **Pattern**: Must match `^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$`
  - Must start and end with alphanumeric character
  - Can contain dashes in the middle
  - Single character slugs are allowed (alphanumeric only)

### Uniqueness Check

- **Real-time validation** (debounced 800ms after user stops typing)
- Checks database for existing slugs
- Excludes current member's slug from check
- If slug is unchanged from original, considered valid (no check needed)

### Validation Messages

- **Invalid Format**: "Enter a valid URL. You can use letters, numbers or dashes."
- **Taken**: "Enter a new URL slug. This one is already taken."
- **Error**: "There was an error. Please try again."

### Visual Feedback

- Valid slug: Green checkmark shown
- Invalid slug: Error message shown
- Save button disabled until slug is valid

---

## Areas of Practice / Interests

### Selection Method

1. **Search & Select**:
   - Type in search input (debounced 250ms)
   - Dropdown shows filtered results
   - Click to select from dropdown

2. **Custom Entry**:
   - Type value and press Enter
   - If value is not in existing list, adds as custom value
   - If value already selected, does nothing

### Management

- Selected services shown in repeater
- Can remove selected services
- Stored as array of strings in `areasOfPractices` field

---

## Testimonials

### Management

- Can add new testimonial via input field
- Can delete existing testimonials (with confirmation)
- Stored as array of strings in `testimonial` field
- Each testimonial is plain text

---

## Data Saving

### Partial Updates

**Product Requirement**: Only changed fields are sent to backend (partial updates).

**Implementation**:

- Each section saves only its relevant fields
- Always includes `_id` and `memberId` for identification
- Backend receives partial data object
- Backend merges with existing data

### Save Response

- **Success**:
  - Updates local `itemMemberObj` with saved data
  - Updates `originalMemberData` for change tracking
  - Shows success message
  - Disables save button
  - Clears unsaved changes flag
- **Failure**:
  - Shows error message
  - Save button remains enabled
  - Unsaved changes flag remains true

### Success/Error Messages

- **Success**: "The information was saved successfully."
- **Error**: "It looks like something went wrong — the information wasn't saved. Please try again later."
- Messages display for 5 seconds, then collapse

---

## Change Detection

### How Changes Are Detected

Each section compares current form values with `originalMemberData`:

1. **Personal**: Compares `firstName`, `lastName`, `fullName`, `url`
2. **Business**: Compares all business fields (deep comparison)
3. **Contact**: Compares all contact fields (deep comparison)
4. **Directory Opt-Out**: Compares `optOut` (inverted checkbox logic)
5. **Website Opt-Out**: Compares `showWixUrl`

### Save Button State

Save buttons are enabled only when:

- Section has unsaved changes
- All required fields are valid
- All format validations pass

---

## Limits & Constraints

### Maximum Counts

- **Addresses**: 10 maximum
- **Phone Numbers**: 10 maximum
- **Gallery Images**: No explicit limit (practical limits may apply)
- **Areas of Practice**: No explicit limit
- **Testimonials**: No explicit limit

### Button States

- "Add Address" button disabled when 10 addresses reached
- "Add Phone" button disabled when 10 phones reached

---

## Step Tracking / Progress Indicator

### Visual Progress

The page includes step tracking that highlights sections as user scrolls:

- **Personal Details** step
- **Business & Services** step
- **Contact** step
- **Gallery** step

**Behavior**:

- When section enters viewport, step is highlighted
- CSS classes added for visual feedback
- Accordion styling changes based on current step

---

## Error Handling

### Token Validation Errors

- If token validation throws error: Show error state
- Log error to console
- User cannot proceed

### Save Errors

- If save fails: Show error message
- Data is not updated
- User can retry save
- Unsaved changes flag remains true

### Validation Errors

- Real-time validation feedback
- Save buttons disabled until valid
- Error messages shown inline

---

## Logging & Debugging

### Change Logging

**Product Requirement**: All data changes are logged for debugging and investigation.

**Implementation**:

- Before/after data is logged to console
- Specific field changes are identified
- Logs include:
  - Timestamp
  - Save type (personal, business, contact)
  - Success/failure status
  - Before data
  - After data
  - Specific changes (field-by-field comparison)

---

## Change History

### Version 1.0 (January 2026)

- Initial documentation
- Documented all form sections and fields
- Documented validation rules
- Documented opt-out confirmations
- Documented main address rules
- Documented unsaved changes tracking
- Documented partial update behavior

---

## Open Questions / Future Considerations

1. **Gallery Image Limits**: Should there be a maximum number of gallery images?

2. **Areas of Practice Limits**: Should there be a maximum number of areas of practice?

3. **Testimonial Limits**: Should there be a maximum number of testimonials?

4. **Banner Images**: Currently supports single image - should multiple banners be supported?

5. **Profile Image External URLs**: Should external URLs be supported for profile images, or only Wix-hosted?

6. **Phone Number Formatting**: Should phone numbers be formatted/validated for specific formats?

7. **Address Geocoding**: Should address validation require exact geocoding match, or is approximate location sufficient?

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative

**Once approved, any changes to these requirements must be documented here with version updates.**
