const { window: wixWindow } = require('@wix/site-window');

const { updateUrlParams } = require('./searchUtils');

const getFiltersSelectors = (_$w, filterName) => ({
  checkBoxContainerSelector: _$w(`#${filterName}CheckBoxContainer`),
  searchTextInputSelector: _$w(`#${filterName}TextInput`),
  clearSearchButtonSelector: _$w(`#${filterName}ClearButton`),
  toggleOptionListButtonSelector: _$w(`#${filterName}ToggleButton`),
  multiCheckBoxSelector: _$w(`#${filterName}CheckBox`),
});

const getParamsMapping = ({ _$w, filter, pagination }) => ({
  page: {
    getValue: () => pagination.currentPage + 1,
    setValue: ({ value }) => {
      pagination.currentPage = parseInt(value) - 1;
    },
  },
  searchText: {
    getValue: () => filter.searchText,
    setValue: ({ value }) => {
      filter.searchText = value;
      _$w('#searchDesktop,#searchTabletMobile').value = value;
    },
  },
  state: {
    getValue: () => (filter.state?.length ? filter.state.join(',') : null),
    setValue: ({ value }) => {
      const states = value.split(',');
      filter['state'] = states;
    },
    setUI: ({ value, dropDownOptions, stateNameCodeMap, sidePanelFilterData, stateCityMap }) => {
      const states = value.split(',');
      onChangeMultiCheckbox({
        _$w,
        filterName: 'state',
        selectedOptions: states,
        dropDownOptions,
        filter,
        pagination,
        stateNameCodeMap,
        sidePanelFilterData,
        stateCityMap,
      });
    },
  },
  city: {
    getValue: () => (filter.city?.length ? filter.city.join(',') : null),
    setValue: ({ value }) => {
      const cities = value.split(',');
      filter['city'] = cities;
    },
    setUI: ({ value, dropDownOptions, stateNameCodeMap, sidePanelFilterData, stateCityMap }) => {
      const cities = value.split(',');
      onChangeMultiCheckbox({
        _$w,
        filterName: 'city',
        selectedOptions: cities,
        dropDownOptions,
        filter,
        pagination,
        stateNameCodeMap,
        sidePanelFilterData,
        stateCityMap,
      });
    },
  },
  practiceAreas: {
    getValue: () => (filter.practiceAreas?.length ? filter.practiceAreas.join(',') : null),
    setValue: ({ value }) => {
      const practices = value.split(',');
      filter['practiceAreas'] = practices;
    },
    setUI: ({ value, dropDownOptions, stateNameCodeMap, sidePanelFilterData, stateCityMap }) => {
      const practices = value.split(',');
      onChangeMultiCheckbox({
        _$w,
        filterName: 'practiceAreas',
        selectedOptions: practices,
        dropDownOptions,
        filter,
        pagination,
        stateNameCodeMap,
        sidePanelFilterData,
        stateCityMap,
      });
    },
  },
  zip: {
    getValue: () => filter.postalcode,
    setValue: ({ value }) => {
      filter.postalcode = value;
      _$w('#zipcode').value = value;
    },
  },
  nearby: {
    getValue: () => (_$w('#nearBy').checked ? 'true' : 'false'),
    setValue: ({ value }) => (_$w('#nearBy').checked = value === 'true'),
  },
});
function handlePagination({ _$w, delta, pagination, searchResults, filter }) {
  const newPage = pagination.currentPage + delta;
  if (newPage < 0 || newPage > 9) return;
  newPage === 0 ? _$w('#previousPage').disable() : _$w('#previousPage').enable();
  newPage === 9 ? _$w('#nextPage').disable() : _$w('#nextPage').enable();
  pagination.currentPage = newPage;

  paginateSearchResults({ _$w, searchResults, pagination });
  updateUrlParams(filter, pagination);
}

function onChangeMultiCheckbox({
  _$w,
  filterName,
  selectedOptions,
  dropDownOptions,
  filter,
  pagination,
  stateNameCodeMap,
  sidePanelFilterData,
  stateCityMap,
  isMobile = false,
}) {
  const { searchTextInputSelector, clearSearchButtonSelector } = getFiltersSelectors(filterName);
  dropDownOptions[filterName].selectedOptions = selectedOptions;

  // Update display text based on selection
  dropDownOptions[filterName].displayText = displayTextValue({
    type: filterName,
    selectedOptions,
    totalLength: selectedOptions.length,
    stateNameCodeMap,
  });

  // Update searchTextInput to show selection summary
  searchTextInputSelector.value = dropDownOptions[filterName].displayText;
  filter[`${filterName}Search`] = '';
  // Show/hide clear button based on selection
  if (selectedOptions.length > 0) {
    clearSearchButtonSelector.expand();
  } else {
    clearSearchButtonSelector.collapse();
  }

  // Update filter object with selected values
  filter[filterName] = selectedOptions;
  filter.skip = 0;

  // Enable/disable city dropdown based on state selection
  if (filterName === 'state') {
    // update city selections based on state selection
    const { multiCheckBoxSelector, searchTextInputSelector: citySearchTextInputSelector } =
      getFiltersSelectors('city');

    const citySelectedOptions = multiCheckBoxSelector.selectedIndices;
    if (citySelectedOptions && citySelectedOptions.length > 0) {
      // get all city options for the selected state
      const options = prepareOptionsFunction({
        filterName: 'city',
        sidePanelFilterData,
        stateCityMap,
        filter,
      });
      // filter out options that are not in the selected state
      const filteredOptions =
        multiCheckBoxSelector.selectedIndices.filter(index =>
          options.some(o => o.value == multiCheckBoxSelector.options[index].value)
        ) || [];
      const filteredOptionsTexts = filteredOptions.map(
        index => multiCheckBoxSelector.options[index].label
      );
      // update city dropdown with filtered options
      if (filteredOptions.length > 0) {
        multiCheckBoxSelector.selectedIndices = filteredOptions;
        citySearchTextInputSelector.value = displayTextValue({
          type: 'city',
          selectedOptions: filteredOptionsTexts,
          totalLength: filteredOptionsTexts.length,
          stateNameCodeMap,
        });
      } else {
        // if no city options are selected, set default city
        setDefaultCity({
          _$w,
          filter,
          dropDownOptions,
          sidePanelFilterData,
          stateCityMap,
        });
      }
    }

    if (selectedOptions && selectedOptions.length > 0 && !_$w('#nearBy').checked) {
      _$w('#cityTextInput').enable();
    } else {
      _$w('#cityTextInput').disable();
      setDefaultCity({
        _$w,
        filter,
        dropDownOptions,
        sidePanelFilterData,
        stateCityMap,
      });
    }
  }

  if (!isMobile) {
    updateUrlParams(filter, pagination);
  }
}

function displayTextValue({ type, selectedOptions, totalLength, stateNameCodeMap }) {
  if (totalLength === 0) {
    return '';
  }
  let displayText = '';
  if (type === 'state') {
    displayText =
      totalLength === 1 ? stateNameCodeMap.get(selectedOptions[0]) : `${totalLength} selected`;
  } else {
    displayText = totalLength === 1 ? selectedOptions[0] : `${totalLength} selected`;
  }
  return displayText;
}

function setDefaultCity({ _$w, filter, dropDownOptions, sidePanelFilterData, stateCityMap }) {
  _$w('#cityTextInput').value = '';
  _$w('#cityTextInput').disable();
  setDefaultState({
    _$w,
    filterName: 'city',
    withSelectedOptions: false,
    filter,
    dropDownOptions,
    sidePanelFilterData,
    stateCityMap,
  });
}

function setDefaultState({
  _$w,
  filterName,
  withSelectedOptions,
  filter,
  dropDownOptions,
  sidePanelFilterData,
  stateCityMap,
}) {
  const { checkBoxContainerSelector, clearSearchButtonSelector } = getFiltersSelectors(
    _$w,
    filterName
  );
  setDefaultFilterOption({
    filterName,
    withSelectedOptions,
    dropDownOptions,
    filter,
    sidePanelFilterData,
    stateCityMap,
  });
  if (!withSelectedOptions) {
    filter[filterName] = [];
  }
  filter[`${filterName}Search`] = '';
  clearSearchButtonSelector.collapse();
  checkBoxContainerSelector.collapse();
}

function setDefaultFilterOption({
  filterName,
  withSelectedOptions = false,
  dropDownOptions,
  filter,
  sidePanelFilterData,
  stateCityMap,
}) {
  const { multiCheckBoxSelector } = getFiltersSelectors(filterName);
  multiCheckBoxSelector.options = prepareOptionsFunction({
    filterName,
    sidePanelFilterData,
    stateCityMap,
    filter,
  });
  if (withSelectedOptions) {
    multiCheckBoxSelector.value = dropDownOptions[filterName].selectedOptions;
  } else {
    multiCheckBoxSelector.value = [];
    dropDownOptions[filterName].selectedOptions = [];
    dropDownOptions[filterName].displayText = undefined;
    filter[filterName] = [];
  }
}

function prepareOptionsFunction({ filterName, sidePanelFilterData, stateCityMap, filter }) {
  let options = [];

  if (filterName === 'state' || filterName === 'practiceAreas') {
    options =
      sidePanelFilterData.has(filterName) && sidePanelFilterData.get(filterName).length > 0
        ? sidePanelFilterData.get(filterName)
        : [];

    options.sort((a, b) => a.label.localeCompare(b.label));
    return options;
  }

  if (filterName === 'city' && filter.state.length > 0) {
    filter.state.forEach(state => {
      const cityArr = stateCityMap.get(state);
      if (!cityArr || cityArr.length === 0) return;
      cityArr.forEach(city => options.push({ label: city, value: city }));
    });

    // Sort cities alphabetically
    options.sort((a, b) => a.label.localeCompare(b.label));
  }

  return options;
}

function handleNumberOfResults({ _$w, pagination, totalCount }) {
  const startResult = pagination.currentPage * pagination.pageSize + 1;
  const endResult = Math.min((pagination.currentPage + 1) * pagination.pageSize, totalCount);
  _$w('#numberOfResults').text = `Showing ${startResult} - ${endResult} of ${totalCount} results`;
}

/**
 * TOGGLES BETWEEN FILTERS BASED ON THE SCREEN SIZE
 */

function showFiltersOnDesktop(_$w) {
  wixWindow
    .getBoundingRect()
    .then(windowRect => {
      if (windowRect.window.width > 1300) {
        // Expand the container if the screen is wider than 1300px
        _$w('#filtersContainer').expand();
      } else {
        // Collapse the container if the screen is 1300px or less
        _$w('#filtersContainer').collapse();
      }
    })
    .catch(err => {
      console.error('Error getting window dimensions:', err);
    });
}
async function getAndSetUserLocation(isSearchingNearby, filter) {
  try {
    let location = {
      coords: {
        latitude: 0,
        longitude: 0,
      },
    };
    location = await wixWindow.getCurrentGeolocation();
    const userLat = location.coords?.latitude ?? 0;
    const userLong = location.coords?.longitude ?? 0;
    filter = {
      ...filter,
      postalcode: isSearchingNearby ? null : filter.postalcode,
      state: isSearchingNearby ? [] : filter.state,
      city: isSearchingNearby ? [] : filter.city,
      stateSearch: isSearchingNearby ? '' : filter.stateSearch,
      citySearch: isSearchingNearby ? '' : filter.citySearch,
      latitude: userLat,
      longitude: userLong,
    };
    return { success: true, filter };
  } catch (error) {
    console.warn('Failed to get user location in getAndSetUserLocation', error);
    return { success: false, filter };
  }
}
function setDefaultDropdownState({ _$w, filterName, filter }) {
  filter[filterName] = [];

  // Hide clear search button ("x")

  const clearSearchButtonSelector = _$w(`#${filterName}ClearButton`);

  clearSearchButtonSelector.collapse();

  // Clear the text present on text input bar

  const searchTextInputSelector = _$w(`#${filterName}TextInput`);

  searchTextInputSelector.value = undefined;

  // Make dropdown options and selected as empty

  const multiCheckBoxSelector = _$w(`#${filterName}CheckBox`);

  multiCheckBoxSelector.options = [];

  multiCheckBoxSelector.value = [];

  // If dropdown drawer is open close it

  const checkBoxContainerSelector = _$w(`#${filterName}CheckBoxContainer`);

  checkBoxContainerSelector.collapse();
}

function toggleDropdownFunctionality({ _$w, filterName, enable }) {
  // If disable then hide clear search button ("x")

  const clearSearchButtonSelector = _$w(`#${filterName}ClearButton`);

  !enable && clearSearchButtonSelector.collapse();

  enable && clearSearchButtonSelector.enable();

  // Toggle functionality based on the enable flag

  const searchTextInputSelector = _$w(`#${filterName}TextInput`);

  enable ? searchTextInputSelector.enable() : searchTextInputSelector.disable();

  // Toggle functionality of dropdown options based on the enable flag

  const multiCheckBoxSelector = _$w(`#${filterName}CheckBox`);

  enable ? multiCheckBoxSelector.enable() : multiCheckBoxSelector.disable();

  // If disable close dropdown drawer

  const checkBoxContainerSelector = _$w(`#${filterName}CheckBoxContainer`);

  !enable && checkBoxContainerSelector.collapse();
}

function updatePaginationUI(_$w, pagination) {
  const { currentPage, totalPages } = pagination;
  const noOfPages = totalPages <= 10 ? totalPages : 10;
  for (let i = 0; i < 10; i++) {
    const pageNumber = i + 1;
    const currentPageButtonIterator = _$w(`#pageButton${pageNumber}`);
    if (i < noOfPages) {
      currentPageButtonIterator.expand();
      currentPageButtonIterator.label = `${pageNumber}`;

      // Style the current page button
      if (pageNumber === currentPage + 1) {
        currentPageButtonIterator.disable();
      } else {
        currentPageButtonIterator.enable();
      }
    } else {
      currentPageButtonIterator.collapse();
    }
  }
  if (noOfPages === 0 || noOfPages === 1) {
    _$w('#previousPage').disable();
    _$w('#nextPage').disable();
    return;
  }
  if (currentPage === 0) {
    _$w('#previousPage').disable();
    return;
  }
  if (currentPage === noOfPages - 1) {
    _$w('#nextPage').disable();
    return;
  }

  _$w('#previousPage').enable();
  _$w('#nextPage').enable();
}
function paginateSearchResults({ _$w, searchResults, pagination }) {
  updatePaginationUI(_$w, pagination);
  handleNumberOfResults({ _$w, pagination, totalCount: searchResults.length });
  const currentPageData = searchResults.slice(
    pagination.currentPage * pagination.pageSize,
    (pagination.currentPage + 1) * pagination.pageSize
  );
  _$w('#profileRepeater').data = currentPageData;
}

// BASED ON DROPDOWN SEARCH TEXT FILTER DROPDOWN OPTIONS

function filterOptionsFunction(filterName, cachedOptions, searchText) {
  return cachedOptions.filter(
    option =>
      option.label.toLowerCase().includes(searchText.toLowerCase()) ||
      (filterName === 'state' && option.value.includes(searchText))
  );
}
module.exports = {
  getFiltersSelectors,
  getParamsMapping,
  handlePagination,
  onChangeMultiCheckbox,
  setDefaultCity,
  setDefaultState,
  setDefaultFilterOption,
  prepareOptionsFunction,
  handleNumberOfResults,
  getAndSetUserLocation,
  setDefaultDropdownState,
  toggleDropdownFunctionality,
  paginateSearchResults,
  showFiltersOnDesktop,
  filterOptionsFunction,
};
