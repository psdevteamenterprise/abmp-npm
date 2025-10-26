//home page code
const { location: wixLocation } = require('@wix/site-location');
const { window: wixWindow, rendering } = require('@wix/site-window');
const { withWarmUpData } = require('psdev-utils/frontend');

const { ADDRESS_STATUS_TYPES, DEFAULT_FILTER, DROPDOWN_OPTIONS } = require('../public/consts.js');
const { createHomepageUtils } = require('../public/Utils/homePage.js');
const {
  getMainAddress,
  formatPracticeAreasForDisplay,
  checkAddressIsVisible,
} = require('../public/Utils/sharedUtils.js');

let filter = JSON.parse(JSON.stringify(DEFAULT_FILTER));
let dropDownOptions = JSON.parse(JSON.stringify(DROPDOWN_OPTIONS));
let stateCityMap;
let retryAttempts = 0;
const sidePanelFilterData = new Map();
const stateNameCodeMap = new Map();
let multiStateBoxSelector;
// Debounce variables
const debounceTimeout = {};
// Pagination variables
const pagination = {
  pageSize: 12,
  currentPage: 0,
};
let searchResults = [];
let isMobile = false;

const homePageOnReady = async ({
  _$w,
  getCompiledFiltersOptions,
  getNonCompiledFiltersOptions,
  filterProfiles,
  logMessage,
  veloGetCurrentGeolocation,
}) => {
  const {
    getParamsMapping,
    handlePagination,
    getFiltersSelectors,
    onChangeMultiCheckbox,
    setDefaultCity,
    setDefaultState,
    setDefaultFilterOption,
    prepareOptionsFunction,
    getAndSetUserLocation,
    setDefaultDropdownState,
    toggleDropdownFunctionality,
    showFiltersOnDesktop,
    filterOptionsFunction,
    parseAndValidateQueryParams,
    updateUrlParams,
    noSearchCriteria,
    search,
  } = createHomepageUtils(_$w, filterProfiles, veloGetCurrentGeolocation, logMessage);
  detectMobile();
  initPageUI();
  attachEventListeners();
  await handleUrlParams();

  async function detectMobile() {
    try {
      const formFactor = await wixWindow.formFactor();
      isMobile = formFactor === 'Mobile';
    } catch (error) {
      isMobile = false;
      console.log('Mobile detection error, assuming desktop:', error);
    }
  }

  function initPageUI() {
    multiStateBoxSelector = _$w('#resultsStateBox');
    multiStateBoxSelector.changeState('loadingState');
    _$w('#searchDesktop').expand();
    _$w('#showingResult').expand();
    showFiltersOnDesktop();
  }

  async function attachEventListeners() {
    /**
     * PAGINATION CODE
     */
    _$w('#previousPage').onClick(() => {
      handlePagination({ delta: -1, pagination, searchResults, filter });
    });

    _$w('#nextPage').onClick(() => {
      handlePagination({ delta: 1, pagination, searchResults, filter });
    });

    _$w(
      '#pageButton1,#pageButton2,#pageButton3,#pageButton4,#pageButton5,#pageButton6,#pageButton7,#pageButton8,#pageButton9,#pageButton10,#pageButton11,#pageButton12,#pageButton13,#pageButton14,#pageButton15'
    ).onClick(event => {
      const label = event.target.label;
      const pageNumber = Number(label) - 1;
      if (pageNumber === pagination.currentPage) return;
      handlePagination({
        delta:
          pageNumber > pagination.currentPage
            ? pageNumber - pagination.currentPage
            : (pagination.currentPage - pageNumber) * -1,
        pagination,
        searchResults,
        filter,
      });
    });
    _$w('#resetFilter').onClick(resetFilter);
    _$w('#clearButton').onClick(resetFilter);

    _$w('#searchDesktop').onInput(event => searchProfilesOnSearchText(event));
    _$w('#searchTabletMobile').onInput(event => searchProfilesOnSearchText(event));
    // Use onChange for the switch and onClick for the retry button
    _$w('#nearBy').onChange(() => {
      updateFiltersState();
      if (isMobile) {
        return;
      }
      nearByHandler();
    });

    _$w('#nearByRetryButton').onClick(() => {
      nearByHandler();
    });

    // ZIP CODE FILTER
    _$w('#zipcode').onInput(event => {
      const zipcode = event.target.value.trim();
      zipcode === '' ? (filter.postalcode = null) : (filter.postalcode = zipcode);
      updateFiltersState();

      if (isMobile) {
        return;
      }

      updateResults('filterTimeout');
    });

    _$w('#filterButton').onClick(() => {
      _$w('#filtersContainer').expand();
      _$w('#filtersContainer').scrollTo();
    });

    _$w('#closeFiltersButton').onClick(() => _$w('#filtersContainer').collapse());
    _$w('#applyButton').onClick(async () => {
      _$w('#filtersContainer').collapse();

      // Update URL params with current filter state before searching
      updateFiltersState();
      await updateUrlParams(filter, pagination);
      await updateResults('zeroTimeout');
    });

    // Retry

    _$w('#retryButton').onClick(async () => {
      if (retryAttempts > 1) {
        resetFilter();

        return;
      }

      retryAttempts += 1;

      await updateResults('zeroTimeout');
    });

    _$w('#clearSearch').onClick(async () => {
      if (!filter.searchText || filter.searchText.length === 0) {
        await resetFilter();

        return;
      }

      filter.searchText = null;

      _$w('#searchDesktop').value = undefined;
      _$w('#searchTabletMobile').value = undefined;

      await updateResults('zeroTimeout');
    });
    const baseUrl = await wixLocation.baseUrl();
    _$w('#profileRepeater').onItemReady(($item, itemData) => {
      // 1) safely default to arrays
      const addresses = Array.isArray(itemData.addresses) ? itemData.addresses : [];
      const areasOfPractices = Array.isArray(itemData.areasOfPractices)
        ? itemData.areasOfPractices
        : [];

      // 2) Profile image
      if (itemData.profileImage) {
        $item('#profileImage').src = itemData.profileImage;
      }

      // 3) Website link
      if (!itemData.showWixUrl && !itemData.showWebsite) {
        $item('#website').collapse();
        $item('#websiteContainer').collapse();
      } else {
        if (itemData.showWebsite) {
          $item('#website').link = itemData.website;
        } else {
          $item('#website').link = `${baseUrl}/profile/${itemData.url}`;
        }
        $item('#website').target = '_blank';
      }

      // 4) Full name
      $item('#fullName').text = itemData.fullName || '';

      // 5) Location text
      const mainAddress = getMainAddress(itemData.addressDisplayOption, addresses);
      $item('#location').text = mainAddress || '';
      const miles = itemData.distance ?? 0;
      $item('#differenceInMiles').text = miles ? miles.toFixed(1) : '';
      if (!miles) {
        $item('#milesAwayText').text = '';
      }

      // 7) "Show maps" button enabled only if there's at least one visible address
      const visible = checkAddressIsVisible(addresses);
      if (visible.length && visible[0].addressStatus === ADDRESS_STATUS_TYPES.FULL_ADDRESS) {
        $item('#showMaps').enable();
        $item('#showMaps').show();
        const { latitude, longitude } = visible[0];
        $item('#showMaps').link = `https://maps.google.com/?q=${latitude},${longitude}`;
        $item('#showMaps').target = '_blank';
      } else {
        $item('#showMaps').hide();
      }

      // 8) Phone / contact form
      if (itemData.showContactForm) {
        $item('#call').expand();
        $item('#callContainer').expand();
        $item('#call').onClick(() => wixWindow.openLightbox('Contact Us', itemData));
      } else {
        $item('#call').collapse();
        $item('#callContainer').collapse();
      }

      // 9) "Book now" button
      if (itemData.bookingUrl) {
        $item('#bookNowButton').show();
        $item('#bookNowButton').link = itemData.bookingUrl;
        $item('#bookNowButton').target = '_blank';
      } else {
        $item('#bookNowButton').hide();
      }

      // 10) Area of practices text
      const text = formatPracticeAreasForDisplay(areasOfPractices);
      if (text) {
        $item('#areaOfPracticesText').text = text;
      } else {
        $item('#areaOfPracticesText').collapse();
      }

      // 11) Hide separator if neither website nor call is shown
      if ($item('#website').collapsed && $item('#call').collapsed) {
        $item('#line').hide();
      }
    });
  }

  async function handleUrlParams() {
    const { isDefaultStateParams, filter: newFilter } = await parseAndValidateQueryParams(
      filter,
      pagination
    );
    filter = newFilter;
    await applyFilterToUI(isDefaultStateParams);
  }

  async function applyFilterToUI(isDefaultStateParams) {
    const setFilterFromParams = async (isInitializeValue = true) => {
      const params = await wixLocation.query();
      console.log('params inside setFilterFromParams ', params);
      const paramsMapping = getParamsMapping(filter, pagination);
      Object.entries(paramsMapping).forEach(async ([param, { setValue, setUI }]) => {
        const value = params[param];
        if (value !== undefined && value !== null && value !== '') {
          try {
            if (isInitializeValue) {
              console.log('setting value ', value, ' for param ', param);
              setValue({
                value: String(value),
              });
            } else {
              console.log('setting ui value ', value, ' for param ', param);
              setUI &&
                (await setUI({
                  value: String(value),
                  dropDownOptions,
                  stateNameCodeMap,
                  sidePanelFilterData,
                  stateCityMap,
                }));
            }
          } catch (error) {
            console.error(`Error setting parameter ${param}:`, error);
          }
        }
      });
    };
    await setFilterFromParams(true);
    if (isDefaultStateParams) {
      logMessage('default state set for nearby');
      console.log('default state set for nearby');
      await Promise.all([fetchFilterData(), nearByHandler(true)]);
      return;
    }
    console.log('not default state');
    const searchPromise =
      filter.searchText && filter.searchText.length > 0
        ? () =>
            search({
              filter,
              pagination,
              debounceTimeout,
              timeoutType: 'searchTimeout',
              isSearchingNearby: _$w('#nearBy').checked,
            }).then(result => {
              searchResults = result;
            })
        : () => updateResults('filterTimeout', true);
    console.log('filter ..', filter);
    try {
      await Promise.all([
        fetchFilterData().then(() => setFilterFromParams(false)),
        searchPromise(),
      ]);
    } catch (error) {
      console.error('[applyFilterToUI] failed with error:', error);
      multiStateBoxSelector.changeState('errorState');
    }
  }

  /**
   * UPDATE PROFILES BASED ON APPLIED/DEFAULT FILTER
   */
  async function updateResults(timeoutType, preservePagination = false) {
    if (debounceTimeout[timeoutType]) {
      clearTimeout(debounceTimeout[timeoutType]);
    }
    searchResults = await search({
      filter,
      pagination,
      debounceTimeout,
      timeoutType,
      isSearchingNearby: _$w('#nearBy').checked,
      preservePagination,
    });
    !preservePagination && (await updateUrlParams(filter, pagination));
    return searchResults;
  }

  /**
   * LEFT SIDE FILTER PANEL CODE
   */

  // RESET FILTER

  async function resetFilter() {
    _$w('#resetFilter').hide();
    loadDefaultCheckBoxOptions('state');
    loadDefaultCheckBoxOptions('practiceAreas');
    loadDefaultCheckBoxOptions('city');
    _$w('#searchDesktop').enable();
    _$w('#searchTabletMobile').enable();
    _$w('#zipcode').enable();
    _$w('#stateTextInput').enable();
    _$w('#searchDesktop').value = '';
    _$w('#searchTabletMobile').value = '';
    _$w('#zipcode').value = '';
    _$w('#stateTextInput').value = '';
    _$w('#nearBy').checked = false;

    // Ensure city input is disabled on reset
    _$w('#cityTextInput').disable();
    filter = JSON.parse(JSON.stringify(DEFAULT_FILTER));
    dropDownOptions = JSON.parse(JSON.stringify(DROPDOWN_OPTIONS));
    await updateResults('zeroTimeout');
  }

  // SEARCH BAR FILTER
  async function searchProfilesOnSearchText(event) {
    const searchText = event.target.value.trim();
    searchText === '' ? (filter.searchText = null) : (filter.searchText = searchText);
    if (searchText.length === 0) {
      filter[`stateSearch`] = '';
      filter[`practiceAreasSearch`] = '';
      await updateResults('zeroTimeout');
      return;
    }

    const timeoutType = 'searchTimeout';
    if (debounceTimeout[timeoutType]) {
      clearTimeout(debounceTimeout[timeoutType]);
    }
    searchResults = await search({
      filter,
      pagination,
      debounceTimeout,
      timeoutType,
      isSearchingNearby: _$w('#nearBy').checked,
    });
    await updateUrlParams(filter, pagination);
  }
  // NEAR BY FILTER
  async function nearByHandler(preservePagination = false) {
    const isSearchingNearby = _$w('#nearBy').checked;

    // 1. Disable nearby input while processing
    _$w('#nearBy').disable();

    // 2. Enable/Disable other inputs first
    updateFiltersState();

    // 3. Do the query
    const { success, filter: newFilter } = await getAndSetUserLocation(isSearchingNearby, filter);
    filter = newFilter;
    console.log('filter inside nearByHandler', filter);
    console.log('success inside nearByHandler', success);
    const renderingEnv = await rendering.env();
    if (!success) {
      logMessage(`nearByHandler Failed to get user location in ${renderingEnv}`);
      if (renderingEnv !== 'backend') {
        multiStateBoxSelector.changeState('nearByState');
      }
      _$w('#nearBy').checked = false;
      updateFiltersState();
      // 4. Re-enable nearby input
      _$w('#nearBy').enable();
      return false;
    }

    // If location is not selected, change state to "resultsState"
    if (!isSearchingNearby) {
      if (await noSearchCriteria()) {
        console.log('no search criteria and no near by');
        multiStateBoxSelector.changeState('noSearchCriteria');
        // 4. Re-enable nearby input
        _$w('#nearBy').enable();
        return;
      }
      multiStateBoxSelector.changeState('resultsState');
    }

    await updateResults('zeroTimeout', preservePagination);

    // 4. Re-enable nearby input when done
    _$w('#nearBy').enable();
    return true;
  }

  // STATE, CITY, AREA OF PRACTICES FILTER
  // FETCH STATE/CITY/AREAS OF PRACTICE FROM BACKEND ONCE AND STORE IT

  async function fetchFilterData() {
    let completeStateList, areasOfPracticesList, stateCityMapList;
    try {
      const { COMPILED_STATE_LIST, COMPILED_AREAS_OF_PRACTICES, COMPILED_STATE_CITY_MAP } =
        await withWarmUpData(
          'getCompiledFiltersOptions',
          () => getCompiledFiltersOptions(),
          logMessage
        );
      completeStateList = COMPILED_STATE_LIST;
      areasOfPracticesList = COMPILED_AREAS_OF_PRACTICES;
      stateCityMapList = COMPILED_STATE_CITY_MAP;
    } catch (error) {
      console.error(
        `Failed to get compiled filters list, falling back to non compiled version with error: ${error}`
      );
      const {
        completeStateList: _completeStateList,
        areasOfPracticesList: _areasOfPracticesList,
        stateCityMapList: _stateCityMapList,
      } = await withWarmUpData(
        'getNonCompiledFiltersOptions',
        () => getNonCompiledFiltersOptions(),
        logMessage
      );
      completeStateList = _completeStateList;
      areasOfPracticesList = _areasOfPracticesList;
      stateCityMapList = _stateCityMapList;
    }
    sidePanelFilterData.set('state', completeStateList);
    multiSelectFilter('state');
    sidePanelFilterData.set('practiceAreas', areasOfPracticesList);
    multiSelectFilter('practiceAreas');
    stateCityMap = new Map(Object.entries(stateCityMapList));
    multiSelectFilter('city');
    sidePanelFilterData
      .get('state')
      .forEach(state => stateNameCodeMap.set(state.value, state.label));

    // Update filter states after data is loaded
    updateFiltersState();
  }

  // CONSTRUCT DROPDOWN OPTIONS FOR STATE, CITY, AREA OF PRACTICES

  // LOAD THE CONSTRUCTED OPTIONS TO RESPECTIVE DROPDOWNS

  function loadDefaultCheckBoxOptions(filterName) {
    setDefaultDropdownState(filterName, filter);
    toggleDropdownFunctionality(filterName, true);
    const options = prepareOptionsFunction({
      filterName,
      sidePanelFilterData,
      stateCityMap,
      filter,
    });
    _$w(`#${filterName}CheckBox`).options = options;

    // Update filter states after loading options
    updateFiltersState();
    return options;
  }

  function updateFiltersState() {
    const nearByChecked = _$w('#nearBy').checked;
    const zipValue = _$w('#zipcode').value?.trim() || null;
    const stateCount = _$w('#stateCheckBox').value?.length || 0;

    // if nearBy → disable all and return immediately
    if (nearByChecked) {
      resetSearch('state');
      resetSearch('city');
      _$w('#zipcode').value = '';
      _$w('#zipcode').disable();
      _$w('#stateTextInput').disable();
      _$w('#cityTextInput').disable();
      return;
    }

    // if zip entered → state & city off, zip stays on
    if (zipValue) {
      resetSearch('state');
      resetSearch('city');
      _$w('#stateTextInput').disable();
      _$w('#cityTextInput').disable();
      _$w('#zipcode').enable();
      zipValue === '' ? (filter.postalcode = null) : (filter.postalcode = zipValue);
      return;
    }

    // default: zip + state + searchDesktop on
    _$w('#zipcode').enable();
    _$w('#stateTextInput').enable();
    _$w('#searchDesktop').enable();

    // only enable city if a state is selected
    if (stateCount > 0) {
      _$w('#cityTextInput').enable();
    } else {
      _$w('#cityTextInput').disable();
    }
  }

  // Filters options based on search text

  const filterOptions = (filterName, searchText) => {
    const options = prepareOptionsFunction({
      filterName,
      sidePanelFilterData,
      stateCityMap,
      filter,
    });
    if (!searchText || searchText.trim() === '') {
      return options;
    }
    return filterOptionsFunction(filterName, options, searchText.trim());
  };
  // DYNAMIC FUNCTION FOR INITIALIZING STATE, CITY, AREA OF PRACTICES FILTER
  function multiSelectFilter(filterName) {
    // Element selectors
    const {
      checkBoxContainerSelector,
      searchTextInputSelector,
      clearSearchButtonSelector,
      toggleOptionListButtonSelector,
      multiCheckBoxSelector,
    } = getFiltersSelectors(filterName);

    // Set up event handlers
    // Clear search button handler

    clearSearchButtonSelector.onClick(async () => {
      searchTextInputSelector.value = undefined;
      setDefaultState({
        filterName,
        withSelectedOptions: false,
        filter,
        dropDownOptions,
        sidePanelFilterData,
        stateCityMap,
      });
      if (filterName === 'state') {
        setDefaultCity({
          filter,
          dropDownOptions,
          sidePanelFilterData,
          stateCityMap,
        });
      }
      await handleFilterChanged(filterName);
    });

    // Toggle dropdown button handler
    toggleOptionListButtonSelector.onClick(() => {
      // If nearby is checked, don't allow any dropdown to open
      if (_$w('#nearBy').checked && filterName !== 'practiceAreas') {
        return;
      }

      if (filterName === 'city') {
        // For city dropdown, ensure we have state selected and city data
        if (filter.state.length === 0) {
          return; // Don't expand if no state selected
        }
        // Ensure city data is loaded
        const options = prepareOptionsFunction({
          filterName,
          sidePanelFilterData,
          stateCityMap,
          filter,
        });
        if (options.length === 0) {
          return; // Don't expand if no city data
        }
        setDefaultFilterOption({
          filterName,
          withSelectedOptions: true,
          dropDownOptions,
          filter,
          sidePanelFilterData,
          stateCityMap,
        });
        checkBoxContainerSelector.collapsed
          ? checkBoxContainerSelector.expand()
          : checkBoxContainerSelector.collapse();
      } else if (
        filterName === 'practiceAreas' ||
        (multiCheckBoxSelector.options.length > 0 &&
          !_$w('#nearBy').checked &&
          _$w('#zipcode').value?.trim() === '')
      ) {
        !searchTextInputSelector.value.length &&
          setDefaultFilterOption({
            filterName,
            withSelectedOptions: true,
            dropDownOptions,
            filter,
            sidePanelFilterData,
            stateCityMap,
          });
        checkBoxContainerSelector.collapsed
          ? checkBoxContainerSelector.expand()
          : checkBoxContainerSelector.collapse();
      }
    });

    // Search input handler

    searchTextInputSelector.onClick(() => {
      handleSearchTextInput(filterName, searchTextInputSelector.value);
    });

    searchTextInputSelector.onBlur(() => {
      if (dropDownOptions[filterName].displayText) {
        clearSearchButtonSelector.expand();
      }
    });

    searchTextInputSelector.onInput(async event => {
      handleSearchTextInput(filterName, event.target.value);
      await handleFilterChanged(filterName, true);
    });

    // Checkbox selection handler

    multiCheckBoxSelector.onChange(async event => {
      await onChangeMultiCheckbox({
        filterName,
        selectedOptions: event.target.value,
        dropDownOptions,
        filter,
        pagination,
        sidePanelFilterData,
        stateCityMap,
        stateNameCodeMap,
        isMobile,
      });

      await handleFilterChanged(filterName);
    });

    checkBoxContainerSelector.onMouseOut(() => checkBoxContainerSelector.collapse());

    // Initialize with default options
    loadDefaultCheckBoxOptions(filterName);
  }
  function handleSearchTextInput(filterName, input) {
    const { checkBoxContainerSelector, clearSearchButtonSelector, multiCheckBoxSelector } =
      getFiltersSelectors(filterName);
    const tofilterOnValue = !input.includes('selected') ? input : '';
    // Toggle clear button visibility
    !input || input.length === 0
      ? clearSearchButtonSelector.collapse()
      : clearSearchButtonSelector.expand();

    // Filter options based on input
    const filteredOptions = filterOptions(filterName, tofilterOnValue);
    multiCheckBoxSelector.options = filteredOptions;

    // Toggle dropdown list visibility
    if (checkBoxContainerSelector.collapsed) {
      if (filteredOptions.length > 0) {
        checkBoxContainerSelector.expand();
      }
    }
  }
  async function handleFilterChanged(filterName, isUserInput = false) {
    try {
      if (isMobile) {
        return;
      }

      const { searchTextInputSelector } = getFiltersSelectors(filterName);
      // Update results based on selection
      filter[`${filterName}Search`] = isUserInput ? searchTextInputSelector.value : '';

      if (filter.searchText && filter.searchText.length > 0) {
        searchResults = await search({
          filter,
          pagination,
          debounceTimeout,
          timeoutType: 'searchTimeout',
          isSearchingNearby: _$w('#nearBy').checked,
        });
        await updateUrlParams(filter, pagination);
      } else {
        await updateResults('filterTimeout');
      }
    } catch (error) {
      console.error('Error in multiSelectFilter:', error);
      multiStateBoxSelector.changeState('errorState');
    }
  }

  function resetSearch(filterName) {
    const { searchTextInputSelector, clearSearchButtonSelector, multiCheckBoxSelector } =
      getFiltersSelectors(filterName);
    clearSearchButtonSelector.collapse();
    multiCheckBoxSelector.options = [];
    searchTextInputSelector.value = '';

    filter[filterName] = [];
    filter[`${filterName}Search`] = '';
  }
};

module.exports = {
  homePageOnReady,
};
