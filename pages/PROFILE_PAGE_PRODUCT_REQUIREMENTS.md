# Profile Page - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for the public-facing Member Profile Page. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The Profile Page is a public-facing page that displays member information to site visitors. It shows member details including contact information, business information, practice areas, testimonials, gallery images, and addresses. The page is dynamically routed using member URL slugs and includes responsive design for different screen sizes.

---

## Page Access & Routing

### URL Structure

**Product Requirement**: Profile pages are accessed via dynamic routing using member URL slugs.

**URL Format**: `/{baseUrl}/profile/{memberSlug}`

**Example**: `https://site.com/profile/johnsmith`

### Data Loading

**Product Requirement**: Profile data is passed to the page via router data.

**Implementation**:

- Data retrieved via `wixWindow.getRouterData()`
- Data is prepared by router handler before page load
- If no profile data exists, user is redirected to 404 page

**404 Handling**:

- If `profileData` is null/undefined, redirect to `/404`
- Prevents showing empty/broken profile pages

---

## Profile Visibility

### Visibility Rules

**Product Requirement**: Profile pages are only accessible if member has opted in to show their profile URL.

**Condition**: `profileData.showWixUrl === true`

**If Not Visible**:

- Router returns 404 (not found)
- Page is not accessible via URL
- Member does not appear in search results (if opted out)

---

## Member Information Display

### Full Name

**Product Requirement**: Member's full name is displayed in multiple locations on the page.

**Display Locations**:

- Main profile header (`#fullNameText`)
- Secondary location (`#fullNameText2`)
- Footer (`#fullNameTextFoter`)

**Behavior**:

- If full name exists: Display in all locations
- If full name missing: Delete all name elements from page

---

## Profile Images

### Profile Image

**Product Requirement**: Profile image is displayed, with fallback to default image.

**Display Logic**:

1. **If profile image exists AND is Wix-hosted**:
   - Display member's profile image
   - Only Wix-hosted images are shown (external URLs ignored)

2. **If profile image missing or not Wix-hosted**:
   - Display default profile image from site config
   - Default image: `DEFAULT_PROFILE_IMAGE` from site configs

**Image Validation**:

- Uses `isWixHostedImage()` to check if image is Wix-hosted
- Wix-hosted images: Start with `wix:` or `https://static.wixstatic.com`
- External URLs are not displayed (security/privacy)

### Logo Image

**Product Requirement**: Business logo is displayed if available.

**Display Logic**:

- If `logoImage` exists: Display logo
- If `logoImage` missing: Delete logo element from page

### Banner Image

**Product Requirement**: Banner image is displayed at top of profile.

**Display Logic**:

- If `bannerImages` array has items: Display first banner image
- Banner images are always displayed (no Wix-hosted check)

---

## Address Display

### Main Address

**Product Requirement**: Main address is displayed prominently on the profile.

**Address Selection Logic**:

1. **Primary**: Address marked as `isMain: true` in `addressDisplayOption`
   - Must have valid coordinates (latitude/longitude)
   - Must not have `addressStatus === 'dont_show'`

2. **Fallback**: First visible address with valid coordinates
   - Visible addresses: `addressStatus !== 'dont_show'`

**Address Formatting**:

- Format depends on `addressStatus`:
  - **`full_address`**: `line1, line2, city, state, postalcode` (first 5 digits only)
  - **`state_city_zip`**: `city, state, postalcode` (first 5 digits only)
  - **`dont_show`**: Address not displayed

**Postal Code Limiting**:

- **CRITICAL**: Only first 5 digits of postal code are shown
- Reason: Privacy protection (doesn't show full ZIP+4)

**Display Locations**:

- Main location text (`#LocationText`)
- Secondary location text (`#LocationText2`)
- Tertiary location text (`#LocationText3`)

**If No Main Address**:

- Delete all location containers from page
- Page displays without location information

### Additional Addresses

**Product Requirement**: Additional addresses (beyond main) are displayed in expandable section.

**Display Logic**:

- Only addresses with `addressStatus !== 'dont_show'` are shown
- Main address is excluded from additional addresses list
- If 2+ visible addresses exist: Show "More Locations" button
- If only 1 address: Hide "More Locations" button, show address title

**Toggle Functionality**:

- "More Locations" button toggles additional addresses container
- Button label changes:
  - Collapsed: "More Locations +"
  - Expanded: "Less Locations -"

**Address Formatting**:

- Same formatting rules as main address
- Each address formatted based on its `addressStatus`

---

## Contact Information

### Contact Form Button

**Product Requirement**: Contact form button is displayed if member has enabled contact form.

**Display Logic**:

- If `showContactForm === true`: Display contact button
- If `showContactForm === false`: Delete contact button element

**Button Behavior**:

- Opens "Contact Us" lightbox
- Passes member profile data to lightbox
- Lightbox contains contact form

### Phone Number

**Product Requirement**: Phone number is displayed if member has selected a phone to show.

**Display Logic**:

- If `phone` (from `toShowPhone`) exists: Display phone number
- If phone missing: Delete phone containers

**Phone Formatting**:

- Phone number displayed as clickable link
- Link format: `tel:{formattedPhoneNumber}`
- Formatted: Removes all non-digit characters except `+`
- Displayed in HTML format: `<a href="tel:...">phone number</a>`

**Display Locations**:

- Primary phone text (`#phoneText`)
- Secondary phone text (`#phoneText2`)

### Booking URL

**Product Requirement**: "Book Now" button is displayed if member has booking URL.

**Display Logic**:

- If `bookingUrl` exists: Display "Book Now" button
- If `bookingUrl` missing: Delete button element

**Button Behavior**:

- Links to member's booking URL
- Opens in new tab (`target="_blank"`)

### License Numbers

**Product Requirement**: License numbers are displayed if member has licenses.

**Display Logic**:

- If `licenceNo` exists: Display license numbers
- If `licenceNo` missing: Delete licenses container

**Format**:

- License numbers joined with commas
- Example: "12345, 67890"

---

## Business Information

### Business Name

**Product Requirement**: Business name is displayed if member has enabled it.

**Display Logic**:

- If `businessName` exists AND `showBusinessName === true`: Display business name
- Otherwise: Delete business name element

### About Service

**Product Requirement**: "About" section is displayed if member has entered about text.

**Display Logic**:

- If `aboutService` exists: Display about section with HTML content
- If `aboutService` missing: Delete about section

**Content Format**:

- Displays as HTML (rich text)
- Supports formatted text, links, etc.

### Areas of Practice

**Product Requirement**: Practice areas are displayed in formatted text and repeater.

**Text Display**:

- Uses `formatPracticeAreasForDisplay()` function
- Format rules:
  - Single area: Show full (truncated to 70 chars if needed)
  - Multiple areas: Show up to 70 characters, then "+X Techniques"
  - Example: "Massage Therapy, Acupuncture, +3 Techniques"

**Repeater Display**:

- If practice areas array exists and has items:
  - Populate repeater with all practice areas
  - Each item displayed as individual tag/badge
- If no practice areas: Delete services section

**Practice Areas Processing**:

- Filtered: Only non-empty strings
- Trimmed: Whitespace removed
- Sorted: Alphabetically (case-insensitive, numeric-aware)

---

## Testimonials

### Testimonials Display

**Product Requirement**: Testimonials are displayed with responsive pagination.

**Display Logic**:

- If testimonials array exists and has items: Display testimonials section
- If no testimonials: Delete testimonials section

### Responsive Pagination

**Product Requirement**: Number of testimonials per page varies by screen size.

**Testimonials Per Page**:

- **Desktop** (≥1301px): 4 testimonials per page
- **Tablet** (≥750px): 2 testimonials per page
- **Mobile** (<750px): 1 testimonial per page

**Breakpoints**:

- Desktop: 1301px
- Tablet: 750px
- Mobile: <750px

**Pagination Controls**:

- Previous button: Shown if not on first page
- Next button: Shown if more testimonials exist
- Buttons hidden when not applicable

**Responsive Updates**:

- Window resize monitored every 500ms
- Testimonials per page recalculated on resize
- Pagination resets to page 0 when breakpoint changes

---

## Gallery

### Gallery Images

**Product Requirement**: Gallery images are displayed if member has uploaded images.

**Display Logic**:

- If `gallery` array exists and has items: Display gallery section
- If no gallery images: Delete gallery section

**Gallery Component**:

- Uses Wix Gallery component
- Images set via `gallery.items = profileData.gallery`
- Each image has `src` property

---

## Student Badge

### Student Badge Display

**Product Requirement**: Student badge is displayed if member is a student.

**Display Logic**:

- If `shouldHaveStudentBadge === true`: Display student badge
- If `shouldHaveStudentBadge === false`: Delete student badge containers

**Badge Locations**:

- Desktop container (`#studentContainer`)
- Mobile container (`#studentContainerMobile`)

**Student Detection**:

- Member has membership with `membertype === 'Student'`
- Can be checked for specific site association or all associations

---

## Member Since

### Member Since Display

**Product Requirement**: "Member Since" year is displayed if member has enabled it.

**Display Logic**:

- If `memberSince` exists: Display member since year
- If `memberSince` missing: Delete member since box

**Data Source**:

- From site association membership `membersince` date
- Only shown if `showABMP === true`
- Formatted as "Month Year" (e.g., "January 2024")

---

## Element Deletion vs Hiding

### Element Management

**Product Requirement**: Missing/empty data elements are deleted from page, not hidden.

**Implementation**:

- Uses `deleteElements()` function
- Elements are removed from DOM
- Prevents empty space on page

**Rationale**:

- Cleaner page layout
- No empty containers
- Better user experience

---

## Responsive Design

### Breakpoints

**Product Requirement**: Page adapts to different screen sizes.

**Breakpoints**:

- Desktop: ≥1301px width
- Tablet: ≥750px width
- Mobile: <750px width

### Responsive Features

1. **Testimonials Pagination**:
   - Different testimonials per page based on screen size
   - Updates dynamically on window resize

2. **Element Visibility**:
   - Some elements may have mobile/desktop variants
   - Student badge has separate mobile/desktop containers

---

## Data Transformation

### Profile Data Preparation

**Product Requirement**: Member data is transformed before display.

**Transformation Steps**:

1. **Address Processing**:
   - Main address identified and formatted
   - Additional addresses filtered and formatted
   - Address visibility rules applied

2. **Practice Areas Processing**:
   - Filtered for non-empty strings
   - Trimmed whitespace
   - Sorted alphabetically

3. **Membership Processing**:
   - Site association membership identified
   - Member since date formatted
   - Student status determined

4. **Image Processing**:
   - Profile image validated (Wix-hosted only)
   - Default images applied when needed

---

## Error Handling

### Missing Data

**Product Requirement**: Missing data is handled gracefully.

**Behavior**:

- Missing elements are deleted (not shown as empty)
- Page displays with available information only
- No error messages shown to user

### Invalid Data

**Product Requirement**: Invalid data is filtered out.

**Examples**:

- Empty practice areas filtered out
- Non-Wix-hosted profile images ignored
- Addresses with `dont_show` status excluded

---

## Performance Considerations

### Data Loading

- Profile data loaded via router (pre-rendered)
- No additional API calls on page load
- Fast page rendering

### Image Optimization

- Only Wix-hosted images displayed (optimized CDN)
- External images excluded (prevents broken images)

---

## Change History

### Version 1.0 (January 2026)

- Initial documentation
- Documented all profile display sections
- Documented address visibility rules
- Documented responsive testimonials pagination
- Documented image display logic
- Documented element deletion behavior

---

## Open Questions / Future Considerations

1. **Image Fallbacks**: Should there be different fallback images for different member types?

2. **Address Privacy**: Should there be additional privacy controls for address display?

3. **Gallery Pagination**: Should gallery images have pagination for large galleries?

4. **Social Sharing**: Should profile pages have social sharing buttons?

5. **Print View**: Should there be a print-friendly version of profile pages?

6. **Analytics**: Should profile page views be tracked?

7. **Related Members**: Should profile pages show related/similar members?

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative

**Once approved, any changes to these requirements must be documented here with version updates.**
