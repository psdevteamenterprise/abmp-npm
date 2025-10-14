const { location: wixLocation } = require('@wix/site-location');

const { DEFAULT_FILTER } = require('../consts.js');

const {
  getAndSetUserLocation,
  getParamsMapping,
  paginateSearchResults,
  handleNumberOfResults,
} = require('./homePage.js');
const { debouncedFunction } = require('./sharedUtils.js');

async function parseAndValidateQueryParams({ _$w, filter, pagination, filterProfiles }) {
  const params = wixLocation.query;
  const paramsMapping = getParamsMapping({ _$w, filter, pagination });
  const {
    siteRevision: _siteRevision,
    branchId: _branchId,
    ...withoutPreviewParams
  } = params || {};
  const isSearchingNearby = params.nearby === 'true';
  const isNoParams = !withoutPreviewParams || Object.keys(withoutPreviewParams).length === 0;
  const { success, filter: newFilter } = await getAndSetUserLocation(isSearchingNearby, filter);

  // Auto-enable nearby if GPS permission granted on fresh page load
  if (
    isNoParams &&
    success &&
    newFilter.latitude !== 0 &&
    newFilter.longitude !== 0 &&
    !isSearchingNearby
  ) {
    wixLocation.queryParams.add({ nearby: 'true', page: '1' });
    return { isDefaultStateParams: true, filter: newFilter };
  }

  if (isNoParams) {
    search({
      filter,
      pagination,
      debounceTimeout: 0,
      timeoutType: 'search',
      isSearchingNearby: false,
      filterProfiles,
    });
    return { isDefaultStateParams: true, filter: newFilter };
  }
  let autoAdjustFilters = false;
  const validatePageValue = value => {
    if (!value || isNaN(Number(value)) || Number(value) < 1 || Number(value) > 10) {
      return { valid: false, value: '1' };
    } else {
      return { valid: true, value: value.toString() };
    }
  };
  const pageValidationResult = validatePageValue(params.page);
  if (!pageValidationResult.valid) {
    paramsMapping.page.setValue({ value: pageValidationResult.value });
    autoAdjustFilters = true;
  }
  if (isSearchingNearby) {
    //if nearby is true only city,state,zip should be reset, others should be preserved and taken from query params
    const paramsToPreserve = ['practiceAreas', 'searchText', 'page'];
    paramsToPreserve.forEach(paramName => {
      if (params[paramName]) {
        let value = params[paramName];
        if (paramName === 'page') {
          value = pageValidationResult.value;
        }
        paramsMapping[paramName].setValue({ value });
      }
    });
    paramsMapping.nearby.setValue({ value: 'true' });
    autoAdjustFilters = true;
  }
  if (autoAdjustFilters) {
    updateUrlParams(filter, pagination);
  }
  const isNearbyFilter =
    (Object.keys(withoutPreviewParams).length === 2 &&
      withoutPreviewParams.nearby &&
      withoutPreviewParams.page) ||
    (Object.keys(withoutPreviewParams).length === 1 && withoutPreviewParams.nearby);
  const isDefaultStateParams = isNoParams || isNearbyFilter;
  return { isDefaultStateParams, filter: newFilter };
}

function updateUrlQuery(filters, defaultFilters) {
  const queryParams = {};

  for (const key in filters) {
    const val = filters[key];
    const defaultVal = defaultFilters[key];

    // Only include non-default values in URL
    if (JSON.stringify(val) !== JSON.stringify(defaultVal)) {
      queryParams[key] = Array.isArray(val) ? JSON.stringify(val) : val;
    }
  }

  wixLocation.queryParams.add(queryParams);
}

function updateUrlParams(filter, pagination) {
  const paramsMapping = getParamsMapping(filter, pagination);
  // Get current query parameters
  const currentParams = wixLocation.query;
  // Remove all existing parameters that we manage
  Object.keys(paramsMapping).forEach(param => {
    if (currentParams[param]) {
      wixLocation.queryParams.remove([param]);
    }
  });

  // Add new parameters only if they have values
  let addedParams = 0;
  Object.entries(paramsMapping).forEach(([param, { getValue }]) => {
    const value = getValue();
    if (param !== 'page') {
      if (value !== null && value !== undefined && value !== '') {
        addedParams++;
        wixLocation.queryParams.add({ [param]: value.toString() });
      }
    }
  });
  if (addedParams === 1) {
    // Only add page URL parameter, if nearby is true when there's exactly one filter
    if (paramsMapping.nearby.getValue() === 'true') {
      wixLocation.queryParams.add({
        page: paramsMapping.page.getValue().toString(),
      });
    }
  } else if (addedParams > 1) {
    // Always add page when there are multiple filters
    wixLocation.queryParams.add({
      page: paramsMapping.page.getValue().toString(),
    });
  }
}

function noSearchCriteria() {
  const params = wixLocation.query;
  const {
    siteRevision: _siteRevision,
    branchId: _branchId,
    ...withoutPreviewParams
  } = params || {};
  const isNoParams = !withoutPreviewParams || Object.keys(withoutPreviewParams).length === 0;

  // Also consider it as no search criteria if only nearby=false exists
  const onlyNearbyFalse =
    Object.keys(withoutPreviewParams).length === 1 && withoutPreviewParams.nearby === 'false';

  return isNoParams || onlyNearbyFalse;
}

/**
 * UPDATE PROFILES BASED ON APPLIED/DEFAULT FILTER
 */
async function search({
  _$w,
  filter,
  pagination,
  debounceTimeout,
  timeoutType,
  isSearchingNearby,
  preservePagination = false,
  filterProfiles,
}) {
  const multiStateBoxSelector = _$w('#resultsStateBox');
  const initSearchResultsUI = () => {
    JSON.stringify(filter) === JSON.stringify(DEFAULT_FILTER)
      ? _$w('#resetFilter').hide()
      : _$w('#resetFilter').show();
    _$w('#showingResult').hide();
    multiStateBoxSelector.changeState('loadingState');
    _$w('#showingResult').hide();
    _$w('#profileRepeater').data = [];
    console.log({ filter });
  };
  const runSearchAndUpdateUI = async (filter, isSearchingNearby) => {
    if (!isSearchingNearby) {
      if (
        JSON.stringify({
          ...filter,
          latitude: 0,
          longitude: 0,
        }) === JSON.stringify(DEFAULT_FILTER)
      ) {
        multiStateBoxSelector.changeState('noSearchCriteria');

        return [];
      }
    }
    const { success, response, error } = await debouncedFunction({
      func: filterProfiles,
      debounceTimeout,
      timeoutType,
      args: { filter, isSearchingNearby },
    });
    if (!success) {
      _$w('#numberOfResults').text = '';
      console.error('[search] failed with error:', error);
      multiStateBoxSelector.changeState('errorState');
      return [];
    }
    const totalCount = response.items.length;
    if (!totalCount) {
      _$w('#numberOfResults').text = 'Showing 0 results';
      _$w('#noResultsMessage').text = `${
        filter.searchText && filter.searchText.length > 0
          ? `'${filter.searchText}' did not match any search. Please try again.`
          : 'No results found for the selected filters. Please adjust your filters and try again'
      }`;
      multiStateBoxSelector.changeState('noResultsState');
      return [];
    }
    console.log({ response });
    handleNumberOfResults({ _$w, pagination, totalCount });
    _$w('#showingResult').show();

    if (!preservePagination || pagination.currentPage >= pagination.totalPages) {
      pagination.currentPage = 0;
    }
    pagination.totalPages = Math.ceil(totalCount / pagination.pageSize);
    paginateSearchResults({ _$w, searchResults: response.items, pagination });
    multiStateBoxSelector.changeState('resultsState');
    return response.items;
  };
  initSearchResultsUI();
  return await runSearchAndUpdateUI(filter, isSearchingNearby);
}

module.exports = {
  parseAndValidateQueryParams,
  updateUrlQuery,
  updateUrlParams,
  noSearchCriteria,
  search,
};
