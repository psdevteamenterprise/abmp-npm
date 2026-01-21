# Profile Routing & SEO - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for Profile Routing and SEO functionality. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The Profile Routing system handles dynamic URL routing for member profile pages, generates SEO metadata, and manages profile visibility. It ensures that only members who have opted in to show their profile URL are accessible, and provides comprehensive SEO optimization for search engines and social media platforms.

---

## URL Routing

### Route Pattern

**Product Requirement**: Profile pages are accessed via dynamic routing using member URL slugs.

**Route Pattern**: `/profile/{slug}`

**Example URLs**:

- `https://site.com/profile/johnsmith`
- `https://site.com/profile/mary-jones-1`

### Router Handler

**Implementation**: `profileRouter(request)`

**Process**:

1. Extract slug from `request.path[0]`
2. If no slug: Redirect to base URL
3. Lookup member by slug
4. Check profile visibility
5. Generate SEO metadata
6. Return page with data

---

## Slug Extraction

### URL Parsing

**Product Requirement**: Member slug is extracted from URL path.

**Extraction**:

- Slug = `request.path[0]`
- First segment of path after `/profile/`

**Validation**:

- If slug is empty/null: Redirect to base URL
- Slug is used to lookup member in database

---

## Member Lookup

### Database Query

**Product Requirement**: Member is looked up by URL slug.

**Lookup Method**: `getMemberBySlug({ slug, excludeDropped: true })`

**Query Parameters**:

- `slug`: URL slug from path
- `excludeDropped`: `true` (excludes dropped members)
- `excludeSearchedMember`: `false` (includes current member)

**Result**:

- Member data if found
- `null` if not found

---

## Profile Visibility

### Visibility Requirement

**Product Requirement**: Profile pages are only accessible if member has opted in to show their profile URL.

**Condition**: `profileData.showWixUrl === true`

**If Not Visible**:

- Router returns 404 (not found)
- Profile page is not accessible
- Member does not appear in search results

**If Visible**:

- Profile page is accessible
- SEO metadata is generated
- Page is returned with member data

---

## 404 Handling

### Not Found Scenarios

**Product Requirement**: 404 is returned in specific scenarios.

**Scenarios**:

1. **No Slug**: Slug is empty/null
   - Redirects to base URL (not 404)

2. **Member Not Found**: Member doesn't exist in database
   - Returns 404

3. **Profile Not Visible**: `showWixUrl === false`
   - Returns 404

4. **Member Dropped**: Member has `action === 'drop'`
   - Excluded from lookup (returns 404)

**404 Response**:

- Uses `notFound()` router method
- Standard 404 page displayed
- No profile data passed to page

---

## SEO Metadata Generation

### SEO Title

**Product Requirement**: SEO title is generated from member information.

**Title Format**: `{fullName} | {practiceAreas} | {siteAssociation} Member`

**Components**:

- `fullName`: Member's full name
- `practiceAreas`: Up to 3 practice areas, comma-separated
- `siteAssociation`: Site association name (e.g., "ABMP")

**Examples**:

- `John Smith | Massage Therapy, Acupuncture | ABMP Member`
- `Mary Jones | ABMP Member` (no practice areas)

**Implementation**: `generateSEOTitle({ fullName, areasOfPractices, siteAssociation })`

### Meta Description

**Product Requirement**: Meta description is generated from member's about service text.

**Source**: `profileData.aboutService` (rich text HTML)

**Processing**:

1. Strip HTML tags using `stripHtmlTags()`
2. Decode HTML entities
3. If empty: Use default description from site config
4. Limit to 160 characters (optimal SEO length)
5. Add "..." if truncated

**HTML Stripping**:

- Removes all HTML tags
- Replaces HTML entities:
  - `&nbsp;` → space
  - `&amp;` → `&`
  - `&lt;` → `<`
  - `&gt;` → `>`
  - `&quot;` → `"`
  - `&#39;` → `'`
- Normalizes whitespace

**Default Description**:

- From site config: `DEFAULT_PROFILE_SEO_DESCRIPTION`
- Used if member has no about service text

### Meta Keywords

**Product Requirement**: Meta keywords are generated from member information.

**Keywords Format**: `{fullName}, {practiceAreas}, {siteAssociation}, {city}, {state}`

**Components**:

- Full name
- Up to 3 practice areas (comma-separated)
- Site association
- City (if available)
- State (if available)

**Processing**:

- Removes duplicate commas
- Removes leading/trailing commas
- Filters out empty values

**Example**: `John Smith, Massage Therapy, Acupuncture, ABMP, Los Angeles, CA`

---

## Open Graph Tags

### OG Tags for Social Sharing

**Product Requirement**: Open Graph tags are generated for social media sharing.

**OG Tags Generated**:

1. **`og:type`**: `"profile"`

2. **`og:title`**: SEO title (same as meta title)

3. **`og:description`**: Meta description (same as meta description)

4. **`og:image`**: Profile image
   - Priority order:
     1. Profile image (if Wix-hosted)
     2. Logo image
     3. Site logo URL
     4. Default profile image
   - Falls back through options if previous not available

5. **`og:url`**: Profile page URL
   - Format: `{baseUrl}/profile/{slug}`

6. **`og:site_name`**: `"{siteAssociation} Members"`
   - Example: "ABMP Members"

---

## Twitter Card Tags

### Twitter Card Metadata

**Product Requirement**: Twitter Card tags are generated for Twitter sharing.

**Twitter Tags Generated**:

1. **`twitter:card`**: `"summary_large_image"`

2. **`twitter:title`**: SEO title

3. **`twitter:description`**: Meta description

4. **`twitter:image`**: Same image as OG image
   - Uses same priority order as `og:image`

---

## Additional SEO Tags

### Geographic Tags

**Product Requirement**: Geographic meta tags are included for location-based SEO.

**Tags**:

- **`geo.region`**: Member's state
- **`geo.placename`**: Member's city

**Behavior**:

- Only included if state/city data exists
- Empty tags are filtered out

### Robots Meta Tag

**Product Requirement**: Robots meta tag controls search engine indexing.

**Tag**: `name: 'robots'`

**Values**:

- **Private Members**: `"noindex, nofollow"`
  - Applied if `isPrivateMember === true`
  - Prevents indexing of PAC staff profiles

- **Public Members**: `"index, follow"`
  - Applied for regular members
  - Allows search engine indexing

### Author Tag

**Product Requirement**: Author meta tag identifies profile owner.

**Tag**: `name: 'author'`

**Content**: Member's full name

---

## Image Selection for SEO

### OG Image Priority

**Product Requirement**: OG image is selected using priority order.

**Priority Order**:

1. **Profile Image** (if Wix-hosted)
   - Only if `isWixHostedImage(profileImage) === true`
   - External URLs are not used

2. **Logo Image**
   - Member's business logo

3. **Site Logo**
   - From site config: `SITE_LOGO_URL`

4. **Default Profile Image**
   - From site config: `DEFAULT_PROFILE_IMAGE`
   - Final fallback

**Image Validation**:

- Profile image must be Wix-hosted to be used
- External URLs are skipped (security/privacy)
- Uses `isWixHostedImage()` validation

---

## Private Member Handling

### PAC Staff Members

**Product Requirement**: PAC staff members have restricted profile visibility.

**Detection**: `isPAC_STAFF(member) === true`

**Criteria**:

- Member has membership with `membertype === 'PAC_STAFF'`

**SEO Behavior**:

- `noIndex: true` in SEO data
- Robots tag: `"noindex, nofollow"`
- Profile still accessible via URL (if `showWixUrl === true`)
- Not indexed by search engines

**Rationale**:

- Staff members may not want public profiles
- Prevents search engine indexing
- Maintains privacy

---

## Profile URL Generation

### URL Construction

**Product Requirement**: Profile URL is generated for SEO and sharing.

**URL Format**: `{baseUrl}/profile/{slug}`

**Components**:

- `baseUrl`: Site base URL from request
- `slug`: Member's URL slug

**Usage**:

- Open Graph `og:url` tag
- Canonical URL
- Social sharing links

---

## Meta Tag Filtering

### Empty Tag Removal

**Product Requirement**: Empty meta tags are filtered out.

**Filtering**:

- Tags with empty `content` are removed
- Tags with whitespace-only content are removed
- Prevents invalid/empty meta tags

**Implementation**:

- Filters tags where `tag.content && tag.content.trim() !== ''`

---

## Error Handling

### Router Errors

**Product Requirement**: Router errors are handled gracefully.

**Error Scenarios**:

1. **Member Lookup Error**:
   - Error logged with slug context
   - Returns 500 status
   - Error message: "Internal Server Error"

2. **SEO Generation Error**:
   - Error logged
   - May fall back to default values
   - Page still rendered if possible

3. **Missing Site Configs**:
   - Error logged
   - Default values used where possible

**Error Response**:

- Uses `sendStatus('500', 'Internal Server Error')`
- Standard error page displayed
- Error details logged to console

---

## Sitemap Generation

### Sitemap Support

**Product Requirement**: Profile sitemap generation is supported (currently disabled).

**Implementation**: `profileSiteMap(sitemapRequest)`

**Current Status**:

- Function returns empty array
- Sitemap generation is commented out/disabled
- May be enabled in future

**Intended Behavior** (when enabled):

- Generate sitemap entries for all visible profiles
- Include profile URLs
- Set change frequency and priority
- Batch processing for large member lists

---

## Data Transformation

### Profile Data Preparation

**Product Requirement**: Member data is transformed for profile display.

**Transformation**: `transformMemberToProfileData(member, siteAssociation)`

**Transformations Applied**:

1. **Address Processing**:
   - Main address identified and formatted
   - Additional addresses filtered
   - Address visibility rules applied

2. **Practice Areas Processing**:
   - Filtered for non-empty strings
   - Trimmed whitespace
   - Sorted alphabetically

3. **Membership Processing**:
   - Site association membership identified
   - Member since date formatted
   - Student badge status determined

4. **License Processing**:
   - License numbers extracted and joined

5. **Image Processing**:
   - Profile image validated
   - Default images prepared

---

## Performance Considerations

### Data Loading

- Member lookup is efficient (indexed by slug)
- Site configs loaded once per request
- SEO metadata generated on-demand

### Caching

- Site configs may be cached
- Profile data not cached (always fresh)
- SEO metadata generated fresh each request

---

## Change History

### Version 1.0 (January 2026)

- Initial documentation
- Documented URL routing and slug extraction
- Documented profile visibility rules
- Documented SEO metadata generation
- Documented Open Graph and Twitter Card tags
- Documented private member handling
- Documented error handling

---

## Open Questions / Future Considerations

1. **Sitemap Enablement**: Should profile sitemap generation be enabled? Currently disabled.

2. **Canonical URLs**: Should canonical URLs be added to prevent duplicate content issues?

3. **Structured Data**: Should structured data (JSON-LD) be added for rich snippets?

4. **Image Optimization**: Should OG images be optimized/resized for social media?

5. **Multi-Language SEO**: Should SEO metadata support multiple languages?

6. **Analytics**: Should profile page views be tracked for SEO analysis?

7. **Redirects**: Should old profile URLs redirect to new URLs if slug changes?

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative
- [ ] SEO Team

**Once approved, any changes to these requirements must be documented here with version updates.**
