# Home Page Search - Product Requirements & Concepts

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Purpose:** This document serves as the official record of product requirements and concepts for the Home Page Search functionality. All decisions and requirements documented here should be referenced when clarifying functionality with clients.

---

## Overview

The Home Page Search is a comprehensive member directory search system that allows users to find members using multiple filter criteria including text search, location-based search, geographic filters (state, city, zip code), and practice area filters. The search supports real-time filtering, pagination, URL parameter persistence, and location-based proximity search.

---

## Page States

### Results State Box States

1. **`loadingState`**: Shown while search is in progress
2. **`resultsState`**: Shown when results are displayed
3. **`noSearchCriteria`**: Shown when no search criteria has been entered
4. **`noResultsState`**: Shown when search returns zero results
5. **`errorState`**: Shown when search fails with an error
6. **`nearByState`**: Shown when nearby search fails (geolocation denied/error)

---

## Search Filters

### Filter Types

The search supports the following filter types:

1. **Search Text** (`searchText`)
2. **State** (`state`)
3. **City** (`city`)
4. **Zip Code** (`postalcode`)
5. **Practice Areas** (`practiceAreas`)
6. **Nearby** (`nearby` - location-based)

### Default Filter Values

```javascript
{
  skip: 0,
  limit: 12,
  practiceAreas: [],
  practiceAreasSearch: '',
  latitude: 0,
  longitude: 0,
  postalcode: null,
  state: [],
  stateSearch: '',
  citySearch: '',
  city: [],
  searchText: null,
}
```

---

## Search Text Filter

### Functionality

**Product Requirement**: Users can search for members by typing text in the search input field.

**Implementation**:

- Two search inputs: `#searchDesktop` and `#searchTabletMobile`
- Real-time search (debounced)
- Searches member `fullName` field using `contains` query
- Case-insensitive search

### Behavior

1. **Input Handling**:
   - Trims whitespace from input
   - Empty string sets `filter.searchText = null`
   - Non-empty string sets `filter.searchText = trimmedValue`

2. **Debouncing**:
   - Debounce timeout: `searchTimeout` (1000ms default)
   - Prevents excessive API calls while user is typing
   - Clears previous timeout when new input is detected

3. **Search Execution**:
   - Executes search after debounce period
   - Updates URL parameters with search text
   - Resets pagination to page 0

4. **Clear Search**:
   - "Clear Search" button appears when search text exists
   - Clicking clear:
     - Sets `filter.searchText = null`
     - Clears search input fields
     - Resets `stateSearch` and `practiceAreasSearch` to empty strings
     - Executes search with cleared text

### Search Query

- **Field**: `fullName`
- **Method**: `contains` (partial match)
- **Case**: Case-insensitive

---

## State Filter

### Functionality

**Product Requirement**: Users can filter members by selecting one or more states.

**Implementation**:

- Multi-select checkbox dropdown
- Searchable dropdown with text input
- Options loaded from database (states that have members)

### Behavior

1. **Option Loading**:
   - Options fetched from `COMPILED_STATE_LIST` or `getCompleteStateList()`
   - States are derived from actual member addresses
   - Options formatted as `{ label: stateName, value: stateCode }`
   - Sorted alphabetically by label

2. **Selection**:
   - Multiple states can be selected
   - Selected states stored as array in `filter.state`
   - Display text shows:
     - Single selection: Full state name
     - Multiple selections: "{count} selected"

3. **Search Within Dropdown**:
   - Text input filters dropdown options
   - Filters by label (state name) or value (state code)
   - Case-insensitive
   - Debounced input (updates as user types)

4. **Clear Selection**:
   - Clear button appears when states are selected
   - Clicking clear resets state selection and search text

### Search Query

- **Field**: `addresses.state`
- **Method**: `hasSome` (matches if any address state is in selected array)
- **Fallback**: If no exact matches, uses `stateSearch` with `contains` method

### Dependencies

- **City Filter**: When states are selected, city dropdown is enabled
- **City Options**: City options are filtered to show only cities in selected states
- **Nearby Filter**: When nearby is enabled, state filter is disabled and cleared

---

## City Filter

### Functionality

**Product Requirement**: Users can filter members by selecting one or more cities.

**Implementation**:

- Multi-select checkbox dropdown
- Searchable dropdown with text input
- Options dynamically loaded based on selected states

### Behavior

1. **Option Loading**:
   - Options loaded from `COMPILED_STATE_CITY_MAP` or `getStateCityMap()`
   - Cities are filtered to show only cities in selected states
   - If no states selected, city dropdown is disabled
   - Options formatted as `{ label: cityName, value: cityName }`
   - Sorted alphabetically

2. **State Dependency**:
   - **CRITICAL**: City dropdown is **disabled** until at least one state is selected
   - When states change, city options are recalculated
   - Previously selected cities that are not in new state selection are automatically cleared

3. **Selection**:
   - Multiple cities can be selected
   - Selected cities stored as array in `filter.city`
   - Display text shows:
     - Single selection: City name
     - Multiple selections: "{count} selected"

4. **Search Within Dropdown**:
   - Text input filters dropdown options
   - Filters by city name (case-insensitive)
   - Debounced input

5. **Clear Selection**:
   - Clear button appears when cities are selected
   - Clicking clear resets city selection and search text

### Search Query

- **Field**: `addresses.city`
- **Method**: `hasSome` (matches if any address city is in selected array)
- **Fallback**: If no exact matches, uses `citySearch` with `contains` method

### Dependencies

- **State Filter**: Requires at least one state to be selected
- **Nearby Filter**: When nearby is enabled, city filter is disabled and cleared

---

## Zip Code Filter

### Functionality

**Product Requirement**: Users can filter members by entering a zip code.

**Implementation**:

- Single text input field
- Real-time filtering (debounced)

### Behavior

1. **Input Handling**:
   - Trims whitespace from input
   - Empty string sets `filter.postalcode = null`
   - Non-empty string sets `filter.postalcode = trimmedValue`

2. **Debouncing**:
   - Debounce timeout: `filterTimeout` (300ms default)
   - Only applies on desktop (mobile requires "Apply" button)

3. **Search Query**:
   - **Field**: `addresses.postalcode`
   - **Method**: `contains` (partial match)
   - Case-sensitive

### Dependencies

- **State/City Filters**: When zip code is entered, state and city filters are disabled and cleared
- **Nearby Filter**: When nearby is enabled, zip code filter is disabled and cleared

---

## Practice Areas Filter

### Functionality

**Product Requirement**: Users can filter members by selecting one or more practice areas (areas of interest).

**Implementation**:

- Multi-select checkbox dropdown
- Searchable dropdown with text input
- Options loaded from `INTERESTS` collection

### Behavior

1. **Option Loading**:
   - Options fetched from `COMPILED_AREAS_OF_PRACTICES` or `getAreasOfPracticeList()`
   - Options formatted as `{ label: practiceAreaName, value: practiceAreaName }`
   - Sorted alphabetically

2. **Selection**:
   - Multiple practice areas can be selected
   - Selected practice areas stored as array in `filter.practiceAreas`
   - Display text shows:
     - Single selection: Practice area name
     - Multiple selections: "{count} selected"

3. **Search Within Dropdown**:
   - Text input filters dropdown options
   - Filters by practice area name (case-insensitive)
   - Debounced input

4. **Clear Selection**:
   - Clear button appears when practice areas are selected
   - Clicking clear resets practice area selection and search text

### Search Query

- **Field**: `areasOfPractices`
- **Method**: `hasSome` (matches if any practice area is in selected array)
- **Fallback**: If no exact matches, uses `practiceAreasSearch` with `contains` method

### Dependencies

- **Nearby Filter**: Practice areas filter remains enabled when nearby is active (unlike state/city/zip)

---

## Nearby Search (Location-Based)

### Functionality

**Product Requirement**: Users can find members near their current location using geolocation.

**Implementation**:

- Toggle switch/checkbox (`#nearBy`)
- Requests browser geolocation permission
- Uses geohash for proximity matching

### Behavior

1. **Activation**:
   - User toggles "Nearby" switch
   - Browser requests geolocation permission
   - If permission granted:
     - Gets user's latitude/longitude
     - Sets `filter.latitude` and `filter.longitude`
     - Sets `isSearchingNearby = true`
   - If permission denied:
     - Shows `nearByState` (error state)
     - Reverts switch to unchecked
     - Does not proceed with search

2. **Filter Interactions**:
   - **When Nearby is Enabled**:
     - State filter: **Disabled and cleared**
     - City filter: **Disabled and cleared**
     - Zip code filter: **Disabled and cleared**
     - Practice areas filter: **Remains enabled**
     - Search text: **Remains enabled**

3. **Geohash Matching**:
   - User location encoded to geohash (precision: `GEO_HASH_PRECISION`)
   - Neighboring geohashes calculated (8 neighbors + user's geohash = 9 total)
   - Members matched if their `locHash` is in the geohash list
   - Uses `hasSome` query method

4. **Distance Calculation**:
   - Distance calculated for each result from user's location to member's main address
   - Results sorted by distance (closest first)
   - Distance displayed in results as "X.X miles away"
   - Distance stored in `item.distance` field

5. **Result Limiting**:
   - When nearby is active, fetches all matching items (no random skip)
   - Limits to `MAX__MEMBERS_SEARCH_RESULTS` after sorting by distance
   - Filters out items with null distance

6. **Deactivation**:
   - When nearby is unchecked:
     - Resets latitude/longitude to 0
     - Re-enables state, city, zip filters
     - If no other search criteria, shows `noSearchCriteria` state

### Auto-Enable on Page Load

**Product Requirement**: If user grants geolocation permission on fresh page load (no URL params), automatically enable nearby search.

**Implementation**:

- On page load, checks if geolocation is available
- If successful and no URL params exist, automatically adds `nearby=true` to URL
- Sets `isDefaultStateParams = true`

### Retry Functionality

- "Retry" button available when nearby search fails
- After 2 retry attempts, automatically resets all filters

---

## Filter State Management

### Filter Enable/Disable Logic

**Product Requirement**: Filters must be enabled/disabled based on dependencies and current selections.

**Priority Order**:

1. **If Nearby is Enabled**:
   - State: Disabled
   - City: Disabled
   - Zip: Disabled
   - Practice Areas: Enabled
   - Search Text: Enabled

2. **If Zip Code is Entered**:
   - State: Disabled
   - City: Disabled
   - Zip: Enabled
   - Practice Areas: Enabled
   - Search Text: Enabled

3. **Default State**:
   - State: Enabled
   - City: Enabled (only if state is selected)
   - Zip: Enabled
   - Practice Areas: Enabled
   - Search Text: Enabled

### City Filter Dependency

**CRITICAL**: City filter is **always disabled** unless:

- At least one state is selected
- Nearby is not enabled
- Zip code is not entered

---

## Search Execution

### Query Building

The search query is built with the following base filters (always applied):

1. **Opt-Out Filter**: `optOut != true` (excludes opted-out members)
2. **Action Filter**: `action != 'drop'` (excludes dropped members)
3. **Visibility Filter**: `isVisible == true` (only visible members)
4. **Member Type Filter**: `memberships.membertype != 'PAC_STAFF'` (excludes staff)
5. **Student Filter**: `memberships.membertype != 'STUDENT'` (excludes students by default)

### Filter Application Order

1. Base filters (always applied)
2. Practice areas filter (if selected)
3. Zip code filter (if entered, and nearby not enabled)
4. State filter (if selected, and nearby not enabled)
5. City filter (if selected, and nearby not enabled)
6. Geohash filter (if nearby enabled)
7. Search text filter (if entered)
8. Student exclusion (always, unless `includeStudents = true`)

### Result Ordering

1. **Non-Nearby Search**:
   - Ordered by `firstName` ascending
   - Random skip applied (if results > MAX\_\_MEMBERS_SEARCH_RESULTS)
   - Results shuffled for additional randomization

2. **Nearby Search**:
   - Ordered by distance (closest first)
   - No random skip
   - Limited to `MAX__MEMBERS_SEARCH_RESULTS` after sorting

### Result Limiting

- **Maximum Results**: `MAX__MEMBERS_SEARCH_RESULTS` (configurable constant)
- **Pagination**: Results paginated with `pageSize = 12`
- **Random Skip**: For non-nearby searches with many results, random skip applied to show different results on each search

---

## Pagination

### Functionality

**Product Requirement**: Search results are paginated with navigation controls.

**Implementation**:

- Page size: 12 results per page
- Page buttons: Up to 10 page number buttons displayed
- Previous/Next buttons
- Current page highlighted/disabled

### Behavior

1. **Page Calculation**:
   - `totalPages = Math.ceil(totalCount / pageSize)`
   - Current page: 0-indexed internally, 1-indexed in URL

2. **Navigation**:
   - Previous button: Disabled on first page (page 0)
   - Next button: Disabled on last page
   - Page number buttons: Click navigates directly to that page
   - Clicking current page button does nothing

3. **Page Button Display**:
   - Shows up to 10 page number buttons
   - If total pages > 10, shows buttons 1-10
   - Current page button is disabled
   - Other page buttons are enabled

4. **Result Display**:
   - Shows: "Showing X - Y of Z results"
   - X = `(currentPage * pageSize) + 1`
   - Y = `Math.min((currentPage + 1) * pageSize, totalCount)`
   - Z = `totalCount`

5. **Pagination Reset**:
   - When new search is executed, pagination resets to page 0
   - Exception: `preservePagination = true` flag (used for nearby toggle)

### URL Parameter

- Page stored in URL as `?page=1` (1-indexed)
- Valid range: 1-10
- Invalid values default to page 1

---

## URL Parameters

### Supported Parameters

1. **`searchText`**: Search text value
2. **`state`**: Comma-separated state codes (e.g., `CA,TX`)
3. **`city`**: Comma-separated city names (e.g., `Los Angeles,San Francisco`)
4. **`practiceAreas`**: Comma-separated practice areas
5. **`zip`**: Zip code value
6. **`nearby`**: `'true'` or `'false'`
7. **`page`**: Page number (1-indexed, 1-10)

### Parameter Management

**Product Requirement**: URL parameters should reflect current search state and allow sharing/bookmarking searches.

**Implementation**:

- Parameters added/removed as filters change
- Only non-default values are added to URL
- Page parameter added when:
  - Multiple filters are active, OR
  - Only nearby filter is active (with exactly one filter)
- Parameters removed when filters are cleared

### URL Parameter Parsing

**On Page Load**:

1. Parse URL parameters
2. Validate page parameter (must be 1-10, defaults to 1 if invalid)
3. Apply parameters to filter state
4. Update UI to reflect filter state
5. Execute search with parsed filters

**Auto-Adjustment**:

- Invalid page numbers are corrected and URL updated
- If only `nearby=true` and `page` exist, preserves other filters from URL

---

## Results Display

### Profile Card Information

Each result displays:

1. **Profile Image**:
   - Only shows if image is Wix-hosted
   - External URLs are not displayed

2. **Full Name**: Member's full name

3. **Location**:
   - Shows main address (from `addressDisplayOption`)
   - Format depends on address visibility settings

4. **Distance** (if nearby enabled):
   - Shows "X.X miles away"
   - Only displayed when nearby is enabled and distance is calculated

5. **Website Link**:
   - Shows if `showWixUrl` or `showWebsite` is true
   - If `showWebsite`: Links to custom website
   - If `showWixUrl`: Links to profile page (`/profile/{url}`)
   - Opens in new tab

6. **Contact Form Button**:
   - Shows if `showContactForm` is true
   - Opens "Contact Us" lightbox with member data

7. **Book Now Button**:
   - Shows if `bookingUrl` exists
   - Links to booking URL
   - Opens in new tab

8. **Show Maps Button**:
   - Shows only if member has:
     - Full address visible (`addressStatus === 'full_address'`)
     - Valid coordinates (latitude and longitude)
   - Links to Google Maps with coordinates
   - Opens in new tab

9. **Areas of Practice**:
   - Shows formatted practice areas text
   - Hidden if no practice areas

10. **Separator Line**:
    - Hidden if neither website nor contact form is shown

---

## Debouncing

### Debounce Timeouts

Different operations use different debounce timeouts:

1. **Search Text**: `searchTimeout` (1000ms / 1 second)
2. **Filter Changes**: `filterTimeout` (300ms / 0.3 seconds)
3. **Immediate**: `zeroTimeout` (0ms - no debounce)

### When Debouncing Applies

- **Desktop**: All filters debounced (except immediate actions)
- **Mobile**: Filter changes require "Apply" button (no auto-search)
- **SSR (Server-Side Rendering)**: No debouncing (immediate execution)

---

## Mobile vs Desktop Behavior

### Mobile Detection

- Detected via `wixWindow.formFactor() === 'Mobile'`
- Falls back to desktop if detection fails

### Mobile-Specific Behavior

1. **Filter Changes**:
   - Filter changes do not trigger immediate search
   - "Apply" button required to execute search
   - "Apply" button collapses filter container and executes search

2. **Filter Container**:
   - Collapsed by default on mobile
   - "Filter" button expands container
   - "Close" button collapses container

3. **Nearby Handler**:
   - Nearby toggle does not trigger search on mobile
   - Requires manual "Apply" or separate search trigger

### Desktop-Specific Behavior

1. **Filter Changes**:
   - Filter changes trigger immediate search (debounced)
   - No "Apply" button needed

2. **Filter Container**:
   - Auto-expands if screen width > 1300px
   - Auto-collapses if screen width ≤ 1300px

---

## Reset Filter

### Functionality

**Product Requirement**: Users can reset all filters to default state.

**Implementation**:

- "Reset Filter" button (hidden when filters are at default)
- "Clear" button (always visible)

### Behavior

When reset is clicked:

1. **Clear All Filters**:
   - Search text: Cleared
   - State: Cleared
   - City: Cleared
   - Zip code: Cleared
   - Practice areas: Cleared
   - Nearby: Unchecked

2. **Reset UI**:
   - All filter inputs cleared
   - All dropdowns reset to default state
   - All filters enabled (except city, which requires state)

3. **Reset Filter Object**:
   - Filter object reset to `DEFAULT_FILTER`

4. **Execute Search**:
   - Executes search with default filter (shows `noSearchCriteria` state)

5. **Hide Reset Button**:
   - Reset button hidden after reset

---

## Error Handling

### Search Errors

**When search fails**:

- State changes to `errorState`
- Error logged to console
- Results count text cleared
- User can click "Retry" button

### Geolocation Errors

**When geolocation fails**:

- State changes to `nearByState`
- Nearby switch reverted to unchecked
- Error logged to console
- User can click "Retry" button
- After 2 retries, filters are reset

### No Results

**When search returns zero results**:

- State changes to `noResultsState`
- Message displayed:
  - If search text exists: `'{searchText}' did not match any search. Please try again.`
  - Otherwise: `'No results found for the selected filters. Please adjust your filters and try again'`
- Results count shows "Showing 0 results"

---

## No Search Criteria State

### When Shown

**Product Requirement**: Show "no search criteria" state when user has not entered any search filters.

**Conditions**:

- No URL parameters (except preview params)
- OR only `nearby=false` parameter exists
- AND filter object equals `DEFAULT_FILTER` (with latitude/longitude = 0)

### Behavior

- State changes to `noSearchCriteria`
- No search is executed
- User must enter at least one filter to see results

---

## Filter Data Loading

### Compiled vs Non-Compiled Options

**Product Requirement**: Use compiled filter options when available for better performance.

**Implementation**:

1. **Try Compiled First**:
   - Attempts to load `COMPILED_STATE_CITY_MAP` from database
   - Contains pre-compiled state list, practice areas, and state-city map

2. **Fallback to Non-Compiled**:
   - If compiled data fails, loads individual collections:
     - States from `STATE` collection + member addresses
     - Practice areas from `INTERESTS` collection
     - State-city map from `STATE_CITY_MAP` collection

### Data Sources

1. **States**:
   - Primary: `COMPILED_STATE_LIST`
   - Fallback: `getCompleteStateList()` (from `STATE` collection + member addresses)

2. **Practice Areas**:
   - Primary: `COMPILED_AREAS_OF_PRACTICES`
   - Fallback: `getAreasOfPracticeList()` (from `INTERESTS` collection)

3. **State-City Map**:
   - Primary: `COMPILED_STATE_CITY_MAP`
   - Fallback: `getStateCityMap()` (from `STATE_CITY_MAP` collection)

---

## Performance Optimizations

### Debouncing

- Search text: 1 second debounce
- Filter changes: 300ms debounce
- Prevents excessive API calls

### Parallel Data Fetching

- Filter options fetched in parallel using `Promise.all()`
- State list and state-city map fetched simultaneously

### Result Limiting

- Maximum results limited to `MAX__MEMBERS_SEARCH_RESULTS`
- Pagination reduces data transfer
- Random skip for non-nearby searches distributes results

### Geohash Optimization

- Uses geohash for efficient proximity matching
- Neighboring geohashes calculated for broader coverage
- Reduces need for complex distance calculations in query

---

## Change History

### Version 1.0 (January 2026)

- Initial documentation
- Documented all filter types and behaviors
- Documented nearby search functionality
- Documented filter dependencies and state management
- Documented pagination and URL parameters
- Documented mobile vs desktop behavior
- Documented error handling and states

---

## Open Questions / Future Considerations

1. **Search Text Scope**: Should search text search other fields (e.g., business name, practice areas) in addition to full name?

2. **Distance Units**: Should distance be configurable (miles vs kilometers)?

3. **Result Sorting**: Should non-nearby searches support other sorting options (e.g., by name, by location)?

4. **Filter Persistence**: Should filter preferences be saved to user's browser/localStorage?

5. **Advanced Filters**: Should additional filters be added (e.g., license type, membership level)?

6. **Search Suggestions**: Should search text provide autocomplete/suggestions?

7. **Result Export**: Should users be able to export search results?

8. **Saved Searches**: Should users be able to save frequently used search combinations?

---

## Approval & Sign-off

This document should be reviewed and approved by:

- [ ] Product Owner
- [ ] Technical Lead
- [ ] Client Representative

**Once approved, any changes to these requirements must be documented here with version updates.**
