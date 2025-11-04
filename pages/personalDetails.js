const { location: wixLocation } = require('@wix/site-location');
const { window: wixWindow } = require('@wix/site-window');
const _ = require('lodash');

const {
  ADDRESS_STATUS_TYPES,
  DEFAULT_BUSINESS_NAME_TEXT,
  FREE_WEBSITE_TEXT_STATES,
  LIGHTBOX_NAMES,
} = require('../public/consts');
const { handleOnCustomValidation, isNotValidUrl } = require('../public/Utils/personalDetailsUtils');
const { generateId } = require('../public/Utils/sharedUtils');

const MAX_PHONES_COUNT = 10;
const MAX_ADDRESSES_COUNT = 10;

const ADDRESS_STATES = {
  VIEW: 'addressViewState',
  EDIT: 'addressEditState',
};

const TESTIMONIAL_STATES = {
  VIEW: 'testimonialState',
  ADD: 'addTestimonialState',
};

const GALLERY_STATES = {
  VIEW: 'imageState',
  ADD: 'addImageState',
};

const MAIN_STATE_BOX_STATES = {
  FORM_STATE: 'formState',
  UNAUTHORIZED_STATE: 'unauthorizedState',
  ERROR_STATE: 'errorState',
};

const FALLBACK_ADDRESS_STATUS = ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;

const FORM_SECTION_HANDLER_MAP = {
  PERSONAL: { section: 'personal', handler: null }, // handler will be set in init
  BUSINESS_SERVICES: { section: 'businessServices', handler: null },
  CONTACT_BOOKING: { section: 'contactBooking', handler: null },
  DIRECTORY_OPT_OUT: { section: 'directoryOptOut', handler: null },
  WEBSITE_OPT_OUT: { section: 'websiteOptOut', handler: null },
};

async function personalDetailsOnReady({
  $w: _$w,
  getInterestAll,
  saveRegistrationData,
  validateMemberToken,
  checkUrlUniqueness,
}) {
  let itemMemberObj = {};
  let originalMemberData = {};
  let selectedServices = [];
  const uploadedImages = {
    profileImage: '',
    logoImage: '',
    bannerImage: '',
  };

  const formHasUnsavedChanges = {
    [FORM_SECTION_HANDLER_MAP.PERSONAL.section]: false,
    [FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.section]: false,
    [FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section]: false,
    [FORM_SECTION_HANDLER_MAP.DIRECTORY_OPT_OUT.section]: false,
    [FORM_SECTION_HANDLER_MAP.WEBSITE_OPT_OUT.section]: false,
  };

  const slugValidationTimeout = {};
  let isSlugValid = true;
  let currentSlugValidationId = 0;

  const SLUG_FLAGS = {
    VALID: '#validSlugFlag',
    INVALID: '#invalidSlugFlag',
  };

  const SLUG_MESSAGES = {
    INVALID_FORMAT: 'Enter a valid URL. You can use letters, numbers or dashes.',
    TAKEN: 'Enter a new URL slug. This one is already taken.',
    ERROR: 'There was an error. Please try again.',
  };

  _$w('#mainMultiStateBox').changeState(MAIN_STATE_BOX_STATES.LOADING_STATE);

  // Set up handler functions with access to closures
  FORM_SECTION_HANDLER_MAP.PERSONAL.handler = () => checkPersonalDataChanged();
  FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.handler = () => checkBusinessDataChanged();
  FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.handler = () => checkContactDataChanged();
  FORM_SECTION_HANDLER_MAP.DIRECTORY_OPT_OUT.handler = () => checkDirectoryOptOutDataChanged();
  FORM_SECTION_HANDLER_MAP.WEBSITE_OPT_OUT.handler = () => checkWebsiteOptOutDataChanged();

  const showUnauthorizedState = () => {
    console.log('❌ Unauthorized');
    _$w('#mainMultiStateBox').changeState(MAIN_STATE_BOX_STATES.UNAUTHORIZED_STATE);
  };

  let memberData, isValid, isStudent;

  // Main initialization
  const queryParams = await wixLocation.query();
  const memberTokenId = queryParams.token;
  const baseUrl = await wixLocation.baseUrl();

  console.log('memberTokenId', memberTokenId);

  if (!memberTokenId) {
    showUnauthorizedState();
    return;
  }

  try {
    const {
      memberData: { isStudent: _isStudent, ...memberDataResponse },
      isValid: isValidResponse,
    } = await validateMemberToken(memberTokenId);
    memberData = memberDataResponse;
    isValid = isValidResponse;
    isStudent = _isStudent;
  } catch (error) {
    console.error(`Error in validateMemberToken memberTokenId : ${memberTokenId}`, error);
    _$w('#mainMultiStateBox').changeState(MAIN_STATE_BOX_STATES.ERROR_STATE);
    return;
  }

  console.log('memberData frontend', memberData);
  if (!isValid) {
    showUnauthorizedState();
    return;
  }

  console.log('✅ Authorized 2', { memberTokenId });
  _$w('#loginButton2').hide();
  _$w('#goBackButton').show();

  _$w('#goBackButton').onClick(async () => {
    try {
      const isFormHasUnsavedChanges = Object.values(formHasUnsavedChanges).some(Boolean);
      if (isFormHasUnsavedChanges) {
        wixWindow.openLightbox(LIGHTBOX_NAMES.SAVE_ALERT, {
          membersExternalPortalUrl: memberData.membersExternalPortalUrl,
        });
      } else {
        await wixLocation.to(memberData.membersExternalPortalUrlL);
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  });

  itemMemberObj = memberData;
  originalMemberData = JSON.parse(JSON.stringify(memberData));
  // Initialize selectedServices based on memberData
  selectedServices = Array.isArray(itemMemberObj.areasOfPractices)
    ? itemMemberObj.areasOfPractices.map(label => ({ _id: generateId(), label: String(label) }))
    : [];

  _$w('#mainMultiStateBox').changeState(MAIN_STATE_BOX_STATES.FORM_STATE);
  init();
  setupStepTrackingWrapper();
  //initially disable save buttons
  _$w('#savePersonalButton').disable();
  _$w('#saveBusinessButton').disable();
  _$w('#saveContactBookingButton').disable();
  onFormDataChanged();

  function setupStepTrackingWrapper() {
    const stepPairs = [
      {
        mark: '#personalDetailsMark',
        sing: '#personalDetailsSign',
        step: '#personalDetailsStep',
        text: '#personalDetailsText',
        css: 'personal',
        vector: '#personalDetailsVector',
      },
      {
        mark: '#businessServicesMark',
        sing: '#businessServicesSign',
        step: '#businessServicesStep',
        text: '#businessServicesText',
        css: 'business',
        vector: '#businessServicesVector',
      },
      {
        mark: '#contactMark',
        sing: '#contactSign',
        step: '#contactStep',
        text: '#contactText',
        css: 'contact',
        vector: '#contactVector',
      },
      {
        mark: '#galleryMark',
        sing: '#gallerySign',
        step: '#galleryStep',
        text: '#galleryText',
        css: 'gallery',
        vector: '#galleryVector',
      },
    ];

    setupStepTracking(stepPairs);
  }

  function setupStepTracking(stepPairs) {
    stepPairs.forEach(({ mark, sing, step, text, css, vector }) => {
      _$w(mark).onViewportEnter(() => {
        _$w(sing).customClassList.add('current-step');
        _$w(step).customClassList.add('highlighted-text');
        _$w(text).customClassList.add('highlighted-text');
        _$w(vector).customClassList.add('disabeld-step');
        _$w('#accordion').customClassList.add(css);
        _$w(mark).scrollTo();
      });

      _$w(mark).onViewportLeave(() => {
        _$w(sing).customClassList.remove('current-step');
        _$w(step).customClassList.remove('highlighted-text');
        _$w(text).customClassList.remove('highlighted-text');
        _$w(vector).customClassList.remove('disabeld-step');
        _$w('#accordion').customClassList.remove(css);
      });
    });
  }

  function init() {
    const fullProfilePageLink = `${baseUrl}/profile/${itemMemberObj.url}`;
    setPersonalDetails(fullProfilePageLink);
    setBusinessServices();
    setContactBooking(fullProfilePageLink);
    initGallery();
  }

  function initGallery() {
    _$w('#galleryRepeater').onItemReady(handleGalleryItem);
    _$w('#uploadGalleryImageButton').onChange(async event => {
      const $item = _$w.at(event.context);
      const uploadButton = $item('#uploadGalleryImageButton');
      if (uploadButton.value.length === 0) return;
      try {
        const uploadedFiles = await uploadButton.uploadFiles();
        // Initialize gallery array if it doesn't exist
        if (!itemMemberObj.gallery) {
          itemMemberObj.gallery = [];
        }

        uploadedFiles.forEach(file => {
          itemMemberObj.gallery.unshift({ src: file.fileUrl });
        });

        await saveGalleryToCMS();
        setGallery();
      } catch (error) {
        _$w('#uploadFailedText').expand();
        setTimeout(() => {
          _$w('#uploadFailedText').collapse();
        }, 5000);
        console.error('Upload failed:', error);
      }
    });
    _$w('#deleteImageButton').onClick(async event => {
      const itemId = event.context.itemId;
      const itemData = _$w('#galleryRepeater').data.find(item => item._id === itemId);
      const result = await wixWindow.openLightbox(LIGHTBOX_NAMES.DELETE_CONFIRM);
      if (result && result.toDelete) {
        itemMemberObj.gallery = itemMemberObj.gallery.filter(img => img.src !== itemData.image.src);
        await saveGalleryToCMS();
        setGallery(); // Re-render
      }
    });
    //
    setGallery();
  }

  function setPersonalDetails(fullProfilePageLink) {
    _$w('#firstNameInput').value = itemMemberObj.firstName || '';
    _$w('#lastNameInput').value = itemMemberObj.lastName || '';

    _$w('#slugInput').value = itemMemberObj.url || '';

    isSlugValid = true;

    _$w(SLUG_FLAGS.VALID).collapse();
    _$w(SLUG_FLAGS.INVALID).collapse();

    _$w('#profileLink').text = fullProfilePageLink;
    _$w('#profileLink').link = fullProfilePageLink;
    _$w('#profileLink').target = '_blank';
    _$w('#licenceNoText').text = (itemMemberObj.licenses || [])
      .map(val => val.license)
      .filter(Boolean)
      .join(', ');

    const handleIsStudent = () => {
      if (isStudent) {
        _$w('#optCheckbox').disable();
        _$w('#optCheckbox').checked = false;
        _$w('#optCheckbox').customClassList.add('disabled-text');
        _$w('#optCheckbox').customClassList.add('disabled-checkbox');
      } else {
        _$w('#optCheckbox').enable();
        _$w('#optCheckbox').checked = !itemMemberObj.optOut;
      }
    };

    handleIsStudent();
    _$w('#optWebsiteCheckbox').checked = itemMemberObj.showWixUrl;
    toggleFreeWebsiteText(itemMemberObj.showWixUrl);

    setupOptOutCheckbox(
      '#optCheckbox',
      '#optConfirmationBox',
      '#yesOptButton',
      '#cancelOptButton',
      confirmed => handleOptConfirmation(confirmed, '#optCheckbox', '#optConfirmationBox', 'optOut')
    );

    setupOptOutCheckbox(
      '#optWebsiteCheckbox',
      '#optWebsiteConfirmationBox',
      '#yesOptWebsiteButton',
      '#cancelOptwebsiteButton',
      confirmed =>
        handleOptConfirmation(
          confirmed,
          '#optWebsiteCheckbox',
          '#optWebsiteConfirmationBox',
          'showWixUrl'
        )
    );
  }

  function setupOptOutCheckbox(
    checkboxId,
    confirmationBoxId,
    confirmBtnId,
    cancelBtnId,
    confirmCallback
  ) {
    const checkbox = _$w(checkboxId);
    const box = _$w(confirmationBoxId);

    checkbox.onChange(e => {
      if (!e.target.checked) {
        box.expand();
        checkbox.disable();
        checkbox.customClassList.add('disabled-text');
      } else {
        confirmCallback(true);
      }
      let sectionHandlerType;
      if (checkboxId === '#optCheckbox') {
        sectionHandlerType = FORM_SECTION_HANDLER_MAP.DIRECTORY_OPT_OUT;
      } else if (checkboxId === '#optWebsiteCheckbox') {
        sectionHandlerType = FORM_SECTION_HANDLER_MAP.WEBSITE_OPT_OUT;
      }
      checkFormChanges(sectionHandlerType);
    });

    _$w(confirmBtnId).onClick(() => confirmCallback(true));
    _$w(cancelBtnId).onClick(() => confirmCallback(false));
  }

  function toggleFreeWebsiteText(isFreeWebsiteEnabled) {
    if (isFreeWebsiteEnabled) {
      _$w('#freeWebsiteText').text = FREE_WEBSITE_TEXT_STATES.ENABLED;
    } else {
      _$w('#freeWebsiteText').text = FREE_WEBSITE_TEXT_STATES.DISABLED;
    }
  }

  async function handleOptConfirmation(confirmed, optCheckbox, optConfirmationBox, field) {
    const checkbox = _$w(optCheckbox);
    const box = _$w(optConfirmationBox);
    if (confirmed) {
      const toSaveOptValue = optCheckbox === '#optCheckbox' ? !checkbox.checked : checkbox.checked;
      const formData = {
        ...itemMemberObj,
        [field]: toSaveOptValue,
      };

      await saveData(formData);
      if (field === 'showWixUrl') {
        const showExistingUrl = _$w('#showExsistingUrlCheckbox').checked;
        if (toSaveOptValue) {
          if (!showExistingUrl) {
            _$w('#showUrlWixCheckbox').checked = true;
          }
          _$w('#showUrlWixCheckbox').enable();
        } else {
          _$w('#showUrlWixCheckbox').checked = false;
          _$w('#showUrlWixCheckbox').disable();
        }
        toggleFreeWebsiteText(toSaveOptValue);
      }
    }

    box.collapse();
    checkbox.enable();
    checkbox.customClassList.remove('disabled-text');

    if (!confirmed) {
      checkbox.checked = !checkbox.checked;
    }
    const section =
      field === 'showWixUrl'
        ? FORM_SECTION_HANDLER_MAP.WEBSITE_OPT_OUT.section
        : FORM_SECTION_HANDLER_MAP.DIRECTORY_OPT_OUT.section;
    formHasUnsavedChanges[section] = false;
  }

  function onFormDataChanged() {
    const CHANGE_EVENTS = {
      ON_CHANGE: 'onChange',
      ON_INPUT: 'onInput',
    };
    const elements = {
      $firstNameInput: _$w('#firstNameInput'),
      $lastNameInput: _$w('#lastNameInput'),
      $businessNameCheckbox: _$w('#businessNameCheckbox'),
      $yearJoinedcheckbox: _$w('#yearJoinedcheckbox'),
      $aboutInput: _$w('#aboutInput'),
      $businessNameInput: _$w('#businessNameInput'),
      $uploadProfileButton: _$w('#uploadProfileButton'),
      $uploadLogoButton: _$w('#uploadLogoButton'),
      $uploadBannerButton: _$w('#uploadBannerButton'),
      $showContactFormCheckbox: _$w('#showCotactFormCheckbox'),
      $contactFormEmailInput: _$w('#contactFormEmailInput'),
      $schedulingLinkInput: _$w('#schedulingLinkInput'),
      $UrlInput: _$w('#UrlInput'),
      $slugInput: _$w('#slugInput'),
    };

    const formChangeEventBindings = {
      [FORM_SECTION_HANDLER_MAP.PERSONAL.section]: [
        { $elem: elements.$firstNameInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
        { $elem: elements.$lastNameInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
        { $elem: elements.$slugInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
      ],
      [FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.section]: [
        { $elem: elements.$businessNameCheckbox, changeEvent: CHANGE_EVENTS.ON_CHANGE },
        { $elem: elements.$yearJoinedcheckbox, changeEvent: CHANGE_EVENTS.ON_CHANGE },
        { $elem: elements.$aboutInput, changeEvent: CHANGE_EVENTS.ON_CHANGE },
        { $elem: elements.$businessNameInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
        { $elem: elements.$uploadProfileButton, changeEvent: CHANGE_EVENTS.ON_CHANGE },
        { $elem: elements.$uploadLogoButton, changeEvent: CHANGE_EVENTS.ON_CHANGE },
        { $elem: elements.$uploadBannerButton, changeEvent: CHANGE_EVENTS.ON_CHANGE },
      ],
      [FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section]: [
        { $elem: elements.$showContactFormCheckbox, changeEvent: CHANGE_EVENTS.ON_CHANGE },
        { $elem: elements.$contactFormEmailInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
        { $elem: elements.$schedulingLinkInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
        { $elem: elements.$UrlInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
      ],
    };

    Object.keys(formChangeEventBindings).forEach(section => {
      formChangeEventBindings[section].forEach(({ $elem, changeEvent }) => {
        $elem[changeEvent](() => {
          const handlerMap = Object.values(FORM_SECTION_HANDLER_MAP).find(
            handlerMap => handlerMap.section === section
          );
          checkFormChanges(handlerMap);
        });
      });
    });

    _$w('#slugInput').onInput(event => {
      _$w('#savePersonalButton').disable();
      const slug = event.target.value;

      isSlugValid = false;

      if (slugValidationTimeout.slugValidation) {
        clearTimeout(slugValidationTimeout.slugValidation);
      }

      const validationId = ++currentSlugValidationId;

      slugValidationTimeout.slugValidation = setTimeout(async () => {
        try {
          if (validationId !== currentSlugValidationId) {
            return;
          }

          const result = await validateSlugRealTime(slug);

          if (validationId === currentSlugValidationId) {
            isSlugValid = result.isValid;
            checkFormChanges(FORM_SECTION_HANDLER_MAP.PERSONAL);
          }
        } catch (error) {
          console.error('Slug validation error:', error);
          if (validationId === currentSlugValidationId) {
            isSlugValid = false;
            checkFormChanges(FORM_SECTION_HANDLER_MAP.PERSONAL);
          }
        }
      }, 800);
    });
  }

  function checkFormChanges(formSectionHandler) {
    let isFormDataChanged = false;
    const toggleSaveDataButton = (formDataType, isFormDataChanged) => {
      const saveButtonMap = {
        [FORM_SECTION_HANDLER_MAP.PERSONAL.section]: '#savePersonalButton',
        [FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.section]: '#saveBusinessButton',
        [FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section]: '#saveContactBookingButton',
      };

      const buttonSelector = saveButtonMap[formDataType];
      if (!buttonSelector) {
        throw new Error(`No save button defined for form section: ${formDataType}`);
      }
      const $saveDataButton = _$w(buttonSelector);

      let isUrlValid = true,
        isEmailValid = true,
        isNameValid = true,
        isSlugValidLocal = true;
      if (formDataType === FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section) {
        isEmailValid = _$w('#contactFormEmailInput').valid;
        isUrlValid =
          !isNotValidUrl(_$w('#UrlInput').value) &&
          !isNotValidUrl(_$w('#schedulingLinkInput').value);
      }
      if (formDataType === FORM_SECTION_HANDLER_MAP.PERSONAL.section) {
        isNameValid = _$w('#firstNameInput').valid && _$w('#lastNameInput').valid;
        isSlugValidLocal = isSlugValid;
      }

      if (isFormDataChanged && isUrlValid && isEmailValid && isNameValid && isSlugValidLocal) {
        $saveDataButton.enable();
      } else {
        $saveDataButton.disable();
      }
    };

    if (formSectionHandler) {
      const { section, handler } = formSectionHandler;
      isFormDataChanged = handler();
      formHasUnsavedChanges[section] = isFormDataChanged;
      if (
        [
          FORM_SECTION_HANDLER_MAP.PERSONAL.section,
          FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.section,
          FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section,
        ].includes(section)
      ) {
        toggleSaveDataButton(section, isFormDataChanged);
      }
    } else {
      Object.values(FORM_SECTION_HANDLER_MAP).forEach(({ section, handler }) => {
        formHasUnsavedChanges[section] = handler();
      });
    }
  }

  function checkWebsiteOptOutDataChanged() {
    const currentWebsiteOptInData = _$w('#optWebsiteCheckbox').checked;
    const originalWebsiteOptInData = originalMemberData.showWixUrl;
    return !_.isEqual(currentWebsiteOptInData, originalWebsiteOptInData);
  }

  function checkDirectoryOptOutDataChanged() {
    const currentDirectoryOptOutData = _$w('#optCheckbox').checked;
    const originalDirectoryOptOutData = !originalMemberData.optOut;
    return !_.isEqual(currentDirectoryOptOutData, originalDirectoryOptOutData);
  }

  function checkBusinessDataChanged() {
    const currentBusinessData = getBusinessAndServicesData();
    const originalBusinessData = {
      showBusinessName: originalMemberData.showBusinessName,
      businessName: originalMemberData.businessName,
      showABMP: originalMemberData.showABMP,
      aboutService: originalMemberData.aboutService,
      profileImage: originalMemberData.profileImage,
      logoImage: originalMemberData.logoImage,
      bannerImages: originalMemberData.bannerImages || [],
      areasOfPractices: originalMemberData.areasOfPractices || [],
      testimonial: originalMemberData.testimonial || [],
    };
    return !_.isEqual(currentBusinessData, originalBusinessData);
  }

  function checkContactDataChanged() {
    const currentContactData = getContactAndBookingData();
    const originalContactData = {
      showContactForm: originalMemberData.showContactForm,
      contactFormEmail: originalMemberData.contactFormEmail,
      toShowPhone: originalMemberData.toShowPhone,
      bookingUrl: originalMemberData.bookingUrl,
      website: originalMemberData.website,
      showWebsite: originalMemberData.showWebsite,
      showWixUrl: originalMemberData.showWixUrl,
      addressDisplayOption: originalMemberData.addressDisplayOption,
      addresses: originalMemberData.addresses,
    };
    return !_.isEqual(currentContactData, originalContactData);
  }

  function setBusinessServices() {
    _$w('#businessNameText').text = itemMemberObj.businessName || DEFAULT_BUSINESS_NAME_TEXT;
    _$w('#businessNameCheckbox').checked = itemMemberObj.showBusinessName;
    _$w('#yearJoinedcheckbox').checked = itemMemberObj.showABMP;
    _$w('#aboutInput').value = itemMemberObj.aboutService;
    _$w('#businessNameInput').value = itemMemberObj.businessName;
    _$w('#clearBusinessNameBtn').onClick(() => {
      _$w('#businessNameInput').value = '';
      checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
    });

    // Get memberships array
    const memberships = Array.isArray(itemMemberObj.memberships) ? itemMemberObj.memberships : [];
    // Find Site Association Member Since
    const siteAssociationMemberSince = memberships.find(
      m => m.association.isSiteAssociation
    )?.membersince;
    // Set yearJoinedText
    if (siteAssociationMemberSince) {
      _$w('#yearJoinedText').text = siteAssociationMemberSince;
    } else {
      _$w('#yearJoinedText').text = 'Year joined not provided';
    }

    uploadImageFromLightbox();
    setupImageUploadAndDeleteHandlers();
    setupServiceSelection();
    setInterestData();
    setupTestimonials();

    // Initialize areasOfPractices array if it doesn't exist
    if (!itemMemberObj.areasOfPractices) {
      itemMemberObj.areasOfPractices = [];
    }

    if (Array.isArray(itemMemberObj.areasOfPractices)) {
      selectedServices = itemMemberObj.areasOfPractices.map(label => ({
        _id: generateId(),
        label: String(label),
      }));
      renderServices();
    }

    displayExistingImagesFromCMS();

    _$w('#savePersonalButton').onClick(savePersonalDetails);
    _$w('#saveBusinessButton').onClick(saveBusinessServices);
    _$w('#servicesRepeater').onItemReady(($item, itemData) => {
      $item('#serviceNameText').text = itemData.label;
    });
  }

  function uploadImage(uploadButton, imageKey, updateUI) {
    _$w(uploadButton).onChange(async () => {
      if (_$w(uploadButton).value?.length > 0) {
        try {
          const uploadedFiles = await _$w(uploadButton).uploadFiles();
          uploadedFiles.forEach(file => {
            uploadedImages[imageKey] = file.fileUrl;
            updateUI(file);
          });
        } catch (error) {
          console.error(`File upload error: ${error.errorCode}`, error.errorDescription);
        }
        checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
      }
    });
  }

  function uploadImageFromLightbox() {
    _$w('#bannerLightboxButton').onClick(async () => {
      const returnedImage = await wixWindow.openLightbox(LIGHTBOX_NAMES.SELECT_BANNER_IMAGES);
      console.log('uploadedImages', returnedImage);

      if (returnedImage && returnedImage.image) {
        console.log('Image returned from lightbox:', returnedImage);

        // Update stored image
        uploadedImages.bannerImage = returnedImage.image;
        checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
        _$w('#bannerImage').src = returnedImage.image;
        _$w('#bannerImageName').text = extractFileName(returnedImage.image);
        _$w('#bannerImageContainer').expand();
      }
    });
  }

  function extractFileName(fileUrl) {
    try {
      const url = new URL(fileUrl);
      const pathParts = url.pathname.split('/');
      return pathParts[pathParts.length - 1] || '';
    } catch {
      return '';
    }
  }

  function setupImageUploadAndDeleteHandlers() {
    uploadImage('#uploadProfileButton', 'profileImage', file => {
      _$w('#profileImage').src = file.fileUrl;
      _$w('#profileImageName').text = formatFileName(file.fileName);
      _$w('#profileImageContainer').expand();
    });

    uploadImage('#uploadLogoButton', 'logoImage', file => {
      _$w('#logoImage').src = file.fileUrl;
      _$w('#logoImageName').text = file.fileName;
      _$w('#logoImageContainer').expand();
    });

    uploadImage('#uploadBannerButton', 'bannerImage', file => {
      _$w('#bannerImage').src = file.fileUrl;
      _$w('#bannerImageName').text = file.fileName;
      _$w('#bannerImageContainer').expand();
    });

    setupDeleteHandler(
      '#deleteProfileImage',
      '#profileImage',
      '#profileImageName',
      '#profileImageContainer',
      'profileImage',
      '#uploadProfileButton'
    );
    setupDeleteHandler(
      '#deleteLogoImage',
      '#logoImage',
      '#logoImageName',
      '#logoImageContainer',
      'logoImage',
      '#uploadLogoButton'
    );
    setupDeleteHandler(
      '#deleteBannerImage',
      '#bannerImage',
      '#bannerImageName',
      '#bannerImageContainer',
      'bannerImage',
      '#uploadBannerButton'
    );
  }

  function setupDeleteHandler(deleteBtn, imgId, nameId, containerId, imageKey, uploadBtnId) {
    _$w(deleteBtn).onClick(async () => {
      const result = await wixWindow.openLightbox(LIGHTBOX_NAMES.DELETE_CONFIRM);

      if (result && result.toDelete) {
        _$w(imgId).src = '';
        _$w(nameId).text = '';
        _$w(containerId).collapse();
        uploadedImages[imageKey] = '';
        checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
        _$w(uploadBtnId).reset();
      }
    });
  }

  function displayExistingImagesFromCMS() {
    const imageMap = [
      {
        key: 'profileImage',
        imageSelector: '#profileImage',
        nameSelector: '#profileImageName',
        containerSelector: '#profileImageContainer',
      },
      {
        key: 'logoImage',
        imageSelector: '#logoImage',
        nameSelector: '#logoImageName',
        containerSelector: '#logoImageContainer',
      },
      {
        key: 'bannerImages',
        imageSelector: '#bannerImage',
        nameSelector: '#bannerImageName',
        containerSelector: '#bannerImageContainer',
        isArray: true,
      },
    ];

    imageMap.forEach(({ key, imageSelector, nameSelector, containerSelector, isArray }) => {
      const imageValue = isArray
        ? Array.isArray(itemMemberObj[key]) && itemMemberObj[key].length > 0
          ? itemMemberObj[key][0]
          : null
        : itemMemberObj[key];

      if (imageValue) {
        _$w(imageSelector).src = imageValue;
        _$w(nameSelector).text = formatFileName(extractFileName(imageValue));
        _$w(containerSelector).expand();
        uploadedImages[key === 'bannerImages' ? 'bannerImage' : key] = imageValue;
      }
    });
  }

  async function handleItemDelete(event, getTextSelector, arrayRef, matchField, renderFn) {
    const result = await wixWindow.openLightbox(LIGHTBOX_NAMES.DELETE_CONFIRM);

    if (result && result.toDelete) {
      const $clickedItem = _$w.at(event.context);
      const textToRemove = $clickedItem(getTextSelector).text;

      arrayRef.splice(
        0,
        arrayRef.length,
        ...arrayRef.filter(item =>
          typeof item === 'string' ? item !== textToRemove : item[matchField] !== textToRemove
        )
      );

      renderFn();
      checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
    }
  }

  async function setInterestData() {
    const interestsData = await getInterestAll();

    _$w('#removeServiceButton').onClick(event => {
      handleItemDelete(event, '#serviceNameText', selectedServices, 'label', renderServices);
    });

    if (Array.isArray(interestsData) && interestsData.length > 0) {
      const formattedData = interestsData.map((val, index) => ({
        _id: String(index),
        value: val,
      }));

      _$w('#repeaterInterest').data = formattedData;
      _$w('#repeaterInterest').onItemReady(($item, itemData, _index) => {
        $item('#interestText').text = itemData.value;
      });
    }
  }

  const debounce_fun = _.debounce(async () => {
    const searchValue = _$w('#intrestInput').value.trim().toLowerCase();
    await filterInterests(searchValue);
  }, 250);

  function setupServiceSelection() {
    const intrestInput = _$w('#intrestInput');

    intrestInput.onClick(() => {
      if (intrestInput.value) {
        intrestInput.onClick(async () => {
          await filterInterests(intrestInput.value);
        });
      } else {
        setInterestData();
      }
      _$w('#containerRepeaterInterest').expand();
    });

    intrestInput.onKeyPress(event => {
      debounce_fun();

      if (event.key === 'Enter') {
        const typedValue = intrestInput.value.trim();

        if (
          typedValue &&
          !selectedServices.some(
            service => service.label.toLowerCase() === typedValue.toLowerCase()
          )
        ) {
          selectedServices.unshift({
            _id: generateId(),
            label: typedValue,
          });
          checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
          renderServices();
          intrestInput.value = '';
          _$w('#containerRepeaterInterest').collapse();
        }
      }
    });

    _$w('#repeaterInterest').onItemReady(($item, itemData) => {
      $item('#interestText').text = itemData.value;

      $item('#intrestItem').onClick(() => {
        if (!selectedServices.some(service => service.label === itemData.value)) {
          selectedServices.unshift({
            _id: generateId(),
            label: itemData.value,
          });
          checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
          renderServices();
          _$w('#intrestInput').value = '';
          _$w('#containerRepeaterInterest').collapse();
        }
      });
    });
  }

  function renderServices() {
    setupRepeater('#servicesRepeater', selectedServices);
  }

  function setupRepeater(repeaterId, data) {
    const repeater = _$w(repeaterId);
    repeater.data = data;
  }

  /**
   * Logs user data changes for debugging and investigation purposes
   * @param {string} saveType - Type of save operation (personal, business, contact)
   * @param {Object} beforeData - Data before save
   * @param {Object} afterData - Data after save
   * @param {boolean} success - Whether the save was successful
   */
  function logUserDataChanges(saveType, beforeData, afterData, success) {
    const timestamp = new Date().toISOString();

    console.group(
      `User Data Change Log - ${saveType.toUpperCase()} - ${success ? 'SUCCESS' : 'FAILED'}`
    );
    console.log('Change Details:', {
      timestamp,
      saveType,
      success,
    });

    console.log('BEFORE Save:', beforeData);
    console.log('AFTER Save:', afterData);

    // Calculate and log specific changes
    const changes = {};
    Object.keys(afterData).forEach(key => {
      if (JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key])) {
        changes[key] = {
          before: beforeData[key],
          after: afterData[key],
        };
      }
    });

    if (Object.keys(changes).length > 0) {
      console.log('Specific Changes:', changes);
    } else {
      console.log('No changes detected in data comparison');
    }

    console.groupEnd();
  }

  async function saveData(formData) {
    // Capture data before save for logging
    const beforeSaveData = JSON.parse(JSON.stringify(itemMemberObj));

    const { type, saveData: saved } = await saveRegistrationData(formData, itemMemberObj._id);

    if (type === 'success') {
      // Log the successful change
      logUserDataChanges('general', beforeSaveData, saved, true);

      itemMemberObj = { ...saved };
      originalMemberData = JSON.parse(JSON.stringify(saved));
      return {
        success: true,
        message: 'The information was saved successfully.',
      };
    } else {
      // Log the failed attempt
      logUserDataChanges('general', beforeSaveData, formData, false);

      return {
        success: false,
        message:
          "It looks like something went wrong — the information wasn't saved. Please try again later.",
      };
    }
  }

  function isValidSlugFormat(slug) {
    if (!slug || slug.length === 0) return false;
    if (slug.length < 3 || slug.length > 50) return false;

    const slugRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
    return slugRegex.test(slug);
  }

  async function validateSlugRealTime(slug) {
    _$w(SLUG_FLAGS.VALID).collapse();
    _$w(SLUG_FLAGS.INVALID).collapse();

    const trimmedSlug = slug.trim();

    if (!isValidSlugFormat(trimmedSlug)) {
      _$w('#invalidSlugMessage').text = SLUG_MESSAGES.INVALID_FORMAT;
      _$w(SLUG_FLAGS.INVALID).expand();
      return { isValid: false };
    }

    if (trimmedSlug === (originalMemberData.url || '')) {
      _$w(SLUG_FLAGS.VALID).collapse();
      _$w(SLUG_FLAGS.INVALID).collapse();
      return { isValid: true };
    }

    try {
      const result = await checkUrlUniqueness(trimmedSlug, itemMemberObj.memberId);
      const isUnique = result.isUnique;

      if (isUnique) {
        _$w(SLUG_FLAGS.VALID).expand();
        _$w(SLUG_FLAGS.INVALID).collapse();
        return { isValid: true };
      } else {
        _$w('#invalidSlugMessage').text = SLUG_MESSAGES.TAKEN;
        _$w(SLUG_FLAGS.INVALID).expand();
        _$w(SLUG_FLAGS.VALID).collapse();
        return { isValid: false };
      }
    } catch (error) {
      console.error('Error checking slug uniqueness:', error);
      _$w('#invalidSlugMessage').text = SLUG_MESSAGES.ERROR;
      _$w(SLUG_FLAGS.INVALID).expand();
      _$w(SLUG_FLAGS.VALID).collapse();
      return { isValid: false };
    }
  }

  function getPersonalData() {
    const firstName = _$w('#firstNameInput').value.trim();
    const lastName = _$w('#lastNameInput').value.trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const url = _$w('#slugInput').value.trim();

    return {
      firstName,
      lastName,
      fullName,
      url,
    };
  }

  function checkPersonalDataChanged() {
    const currentPersonalData = getPersonalData();
    const originalPersonalData = {
      firstName: originalMemberData.firstName || '',
      lastName: originalMemberData.lastName || '',
      fullName: originalMemberData.fullName || '',
      url: originalMemberData.url || '',
    };
    return !_.isEqual(currentPersonalData, originalPersonalData);
  }

  function getBusinessAndServicesData() {
    const getCurrentTestimonials = () =>
      _$w('#testimonialRepeater')
        .data.filter(item => item.isAdd === false)
        .map(item => item.text)
        .filter(Boolean) || itemMemberObj.testimonial;

    return {
      showBusinessName: _$w('#businessNameCheckbox').checked,
      businessName: _$w('#businessNameInput').value,
      showABMP: _$w('#yearJoinedcheckbox').checked,
      profileImage: uploadedImages.profileImage,
      logoImage: uploadedImages.logoImage,
      bannerImages: uploadedImages.bannerImage ? [uploadedImages.bannerImage] : [],
      areasOfPractices: selectedServices.map(service => service.label),
      aboutService: _$w('#aboutInput').value,
      testimonial: getCurrentTestimonials(),
    };
  }

  async function savePersonalDetails() {
    const beforeData = JSON.parse(JSON.stringify(itemMemberObj));
    const personalChanges = getPersonalData();
    const originalUrl = beforeData.url;

    const formData = {
      ...itemMemberObj,
      ...personalChanges,
    };

    // Log the specific personal data changes
    console.group('Personal Details Save Attempt');
    console.log('Current Data:', beforeData);
    console.log('Changes Being Applied:', personalChanges);
    console.log('Final Form Data:', formData);
    console.groupEnd();

    const result = await saveData(formData);
    formHasUnsavedChanges[FORM_SECTION_HANDLER_MAP.PERSONAL.section] = false;

    if (result.success) {
      if (personalChanges.url && personalChanges.url !== originalUrl) {
        const newProfileLink = `${baseUrl}/profile/${personalChanges.url}`;
        console.log('🔗 Updating profile link:', {
          originalUrl,
          newUrl: personalChanges.url,
          newProfileLink,
        });
        _$w('#profileLink').text = newProfileLink;
        _$w('#profileLink').link = newProfileLink;

        _$w(SLUG_FLAGS.VALID).collapse();
        _$w(SLUG_FLAGS.INVALID).collapse();
      }

      _$w('#savePersonalButton').disable();
    }

    handleSaveDataFeedback(_$w('#personalMessage'), result.message);
  }

  async function saveBusinessServices() {
    const beforeData = JSON.parse(JSON.stringify(itemMemberObj));
    const businessChanges = getBusinessAndServicesData();

    const formData = {
      ...itemMemberObj,
      ...businessChanges,
    };

    // Log the specific business data changes
    console.group('Business Services Save Attempt');
    console.log('Current Data:', beforeData);
    console.log('Changes Being Applied:', businessChanges);
    console.log('Final Form Data:', formData);
    console.log('Image Changes:', {
      profileImage: uploadedImages.profileImage,
      logoImage: uploadedImages.logoImage,
      bannerImage: uploadedImages.bannerImage,
    });
    console.log('Services Selected:', selectedServices);
    console.groupEnd();

    const result = await saveData(formData);
    formHasUnsavedChanges[FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.section] = false;
    handleSaveDataFeedback(_$w('#businessMessage'), result.message);
    _$w('#businessNameText').text = formData.businessName || DEFAULT_BUSINESS_NAME_TEXT;
  }

  function setupTestimonials() {
    const addTestimonialButton = _$w('#addTestimonialButton');

    addTestimonialButton.onClick(handleAddTestimonial);
    _$w('#deleteTestimonialButton').onClick(event => {
      handleItemDelete(
        event,
        '#testimonialText',
        itemMemberObj.testimonial,
        null,
        renderTestimonials
      );
    });

    renderTestimonials();
    _$w('#testimonialRepeater').onItemReady(($item, itemData) => {
      const msb = $item('#testimonialMSB');
      if (itemData.isAdd) {
        msb.changeState(TESTIMONIAL_STATES.ADD);
      } else {
        msb.changeState(TESTIMONIAL_STATES.VIEW);
        $item('#testimonialText').text = itemData.text;
      }
    });
  }

  function renderTestimonials() {
    const testimonials =
      itemMemberObj.testimonial === null
        ? []
        : Array.isArray(itemMemberObj.testimonial)
          ? itemMemberObj.testimonial
          : [];
    const addItem = { _id: 'add-item', text: '', isAdd: true };
    const testimonialData = [
      addItem,
      ...testimonials.map(text => ({ _id: generateId(), text, isAdd: false })),
    ];

    setupRepeater('#testimonialRepeater', testimonialData);
  }

  function handleAddTestimonial(event) {
    const $clickedItem = _$w.at(event.context);
    const input = $clickedItem('#testimonialsInput');
    const newText = input.value;

    if (newText?.trim()) {
      // Initialize testimonial array if it doesn't exist
      if (!itemMemberObj.testimonial) {
        itemMemberObj.testimonial = [];
      }
      itemMemberObj.testimonial.push(newText.trim());
      input.value = '';
      renderTestimonials();
      checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
    }
  }

  function setContactBooking(fullProfilePageLink) {
    // derive booleans only once
    const showWixUrlCheckbox = !itemMemberObj.showWebsite && itemMemberObj.showWixUrl;
    const showExistingUrlCheckbox = itemMemberObj.showWebsite;

    // basic fields
    _$w('#showCotactFormCheckbox').checked = itemMemberObj.showContactForm;
    _$w('#contactFormEmailInput').value = itemMemberObj.contactFormEmail;
    _$w('#schedulingLinkInput').value = itemMemberObj.bookingUrl;

    // URL part
    _$w('#UrlInput').value = itemMemberObj.website || '';
    _$w('#showUrlWixCheckbox').checked = showWixUrlCheckbox;
    _$w('#showExsistingUrlCheckbox').checked = showExistingUrlCheckbox;
    _$w('#urlWebsiteText').text = fullProfilePageLink;

    // custom validation for url inputs and email
    handleOnCustomValidation(_$w('#UrlInput'));
    handleOnCustomValidation(_$w('#schedulingLinkInput'));

    // enable/disable & styling in one pass
    if (showWixUrlCheckbox) {
      _$w('#UrlInput').disable();
      _$w('#urlWebsiteText').customClassList.add('highlighted-text');
    } else if (showExistingUrlCheckbox) {
      _$w('#UrlInput').enable();
      _$w('#urlWebsiteText').customClassList.remove('highlighted-text');
    } else {
      // neither checked: disable input & remove highlight
      _$w('#UrlInput').disable();
      _$w('#urlWebsiteText').customClassList.remove('highlighted-text');
    }

    // clear buttons
    _$w('#clearSchedulingLinkInput').onClick(() => {
      _$w('#schedulingLinkInput').value = '';
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });
    _$w('#clearExistingUrlLinkInput').onClick(() => {
      _$w('#UrlInput').value = '';
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });

    // toggle handlers
    _$w('#showUrlWixCheckbox').onChange(e => {
      if (e.target.checked) {
        _$w('#showExsistingUrlCheckbox').checked = false;
        _$w('#UrlInput').disable();
        _$w('#urlWebsiteText').customClassList.add('highlighted-text');
      }
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });
    _$w('#showExsistingUrlCheckbox').onChange(e => {
      if (e.target.checked) {
        _$w('#showUrlWixCheckbox').checked = false;
        _$w('#UrlInput').enable();
        _$w('#urlWebsiteText').customClassList.remove('highlighted-text');
      }
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });

    setupAddressRepeater();
    setupPhoneRepeater();
    _$w('#saveContactBookingButton').onClick(saveContactBooking);
  }

  /**
   * Converts our internal address format to AddressInput component format
   */
  function convertToAddressInputFormat(address) {
    if (!address) return null;

    if (!address.line1 && !address.city && !address.state && !address.postalcode) {
      return null;
    }

    const formatted = formatFullAddress(address);

    const hasValidCoordinates = Boolean(address.latitude && address.longitude);
    const location = hasValidCoordinates
      ? { latitude: address.latitude, longitude: address.longitude }
      : null;

    return {
      formatted,
      location,
      streetAddress: {
        name: extractStreetName(address.line1),
        number: extractStreetNumber(address.line1),
      },
      city: address.city || '',
      subdivision: address.state || '',
      country: address.country || 'US',
      postalCode: address.postalcode || '',
    };
  }

  /**
   * Converts AddressInput format back to our internal address format
   */
  function parseAddressInput(addressInputValue, existingAddress = null) {
    if (!addressInputValue) return null;

    let line1 = '';
    if (addressInputValue.streetAddress) {
      const number = addressInputValue.streetAddress.number || '';
      const name = addressInputValue.streetAddress.name || '';
      line1 = `${number} ${name}`.trim();
    }

    if (!line1 && addressInputValue.formatted) {
      line1 = addressInputValue.formatted.split(',')[0]?.trim() || '';
    }

    return {
      key: existingAddress?.key || generateId(),
      line1,
      line2: existingAddress?.line2 || '',
      city: addressInputValue.city || '',
      state: addressInputValue.subdivision || '',
      postalcode: addressInputValue.postalCode || '',
      country: addressInputValue.country || 'US',
      latitude: addressInputValue.location?.latitude || existingAddress?.latitude || 0,
      longitude: addressInputValue.location?.longitude || existingAddress?.longitude || 0,
      addressStatus: existingAddress?.addressStatus || FALLBACK_ADDRESS_STATUS,
    };
  }

  function setupAddressRepeater() {
    _$w('#addressesList').onItemReady(($item, itemData, index) =>
      handleAddressItem($item, itemData, index)
    );
    renderAddressesList();

    _$w('#newAddressButton').onClick(addNewAddress);

    setupAddressRepeaterEventListeners();
  }

  function setupAddressRepeaterEventListeners() {
    _$w('#mainAddressCheckbox').onChange(event => {
      const data = _$w('#addressesList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const $item = _$w.at(event.context);

      _$w('#mainAddressCheckbox').checked = false;
      $item('#mainAddressCheckbox').checked = true;

      if (clickedItemData.address.addressStatus === ADDRESS_STATUS_TYPES.DONT_SHOW) {
        updateAddressStatus(clickedItemData._id, ADDRESS_STATUS_TYPES.STATE_CITY_ZIP);
        $item('#addressStatusOptions').value = ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;
      }

      updateMainAddressSelection(clickedItemData._id);
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });

    _$w('#addressStatusOptions').onChange(event => {
      const data = _$w('#addressesList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const newStatus = event.target.value;
      const $item = _$w.at(event.context);
      const isMain = $item('#mainAddressCheckbox').checked;

      if (isMain && newStatus === ADDRESS_STATUS_TYPES.DONT_SHOW) {
        $item('#addressStatusOptions').value = ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;
        return;
      }

      updateAddressStatus(clickedItemData._id, newStatus);
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });

    _$w('#addressItemEditBtn').onClick(event => {
      const data = _$w('#addressesList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const $item = _$w.at(event.context);
      $item('#addressItemStates').changeState(ADDRESS_STATES.EDIT);
      const addressInputValue = convertToAddressInputFormat(clickedItemData.address);
      $item('#addressEditInput').value = addressInputValue;
    });

    _$w('#addressItemRemoveBtn').onClick(async event => {
      const data = _$w('#addressesList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const result = await wixWindow.openLightbox(LIGHTBOX_NAMES.DELETE_CONFIRM);
      if (result && result.toDelete) {
        removeAddress(clickedItemData._id);
      }
    });

    _$w('#addressEditInput').onChange(event => {
      const $item = _$w.at(event.context);
      validateAddressCompleteness($item);
    });

    _$w('#addressEditCancelBtn').onClick(event => {
      const data = _$w('#addressesList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const $item = _$w.at(event.context);
      if (clickedItemData.isNewAddress) {
        removeNewAddressFromRepeater(clickedItemData._id);
      } else {
        $item('#addressItemStates').changeState(ADDRESS_STATES.VIEW);
        $item('#addressValidationMessage').hide();
      }
    });

    _$w('#addressEditSaveBtn').onClick(event => {
      const data = _$w('#addressesList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const $item = _$w.at(event.context);
      saveAddressFromSingleInput($item, clickedItemData);
    });
  }

  function addNewAddress() {
    const currentData = _$w('#addressesList').data || [];

    if (currentData.length >= MAX_ADDRESSES_COUNT) {
      return;
    }

    const newAddressId = generateId();

    const newAddress = {
      key: newAddressId,
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalcode: '',
      country: 'US',
      latitude: 0,
      longitude: 0,
      addressStatus: ADDRESS_STATUS_TYPES.STATE_CITY_ZIP,
    };

    const newAddressItem = {
      _id: newAddressId,
      address: newAddress,
      isMain: false,
      addressStatus: ADDRESS_STATUS_TYPES.STATE_CITY_ZIP,
      isNewAddress: true,
    };

    renderAddressesList([...currentData, newAddressItem]);
  }

  function handleAddressItem($item, itemData, index) {
    const multiStateBox = $item('#addressItemStates');

    setupAddressViewState($item, itemData, index);
    setupAddressEditState($item, itemData, index);

    if (itemData.isNewAddress) {
      multiStateBox.changeState(ADDRESS_STATES.EDIT);
    } else {
      multiStateBox.changeState(ADDRESS_STATES.VIEW);
    }
  }

  function setupAddressViewState($item, itemData, index) {
    const formattedAddress = formatFullAddress(itemData.address);

    $item('#addressItemtext').text = formattedAddress;
    $item('#addressItemNumber').text = `Location ${index + 1}`;
    $item('#mainAddressCheckbox').checked = itemData.isMain || false;

    const addressStatus = itemData.address.addressStatus || ADDRESS_STATUS_TYPES.STATE_CITY_ZIP;
    $item('#addressStatusOptions').value = addressStatus;
  }

  function setupAddressEditState($item, itemData, _index) {
    $item('#addressEditInput').enable();

    const addressInputValue = convertToAddressInputFormat(itemData.address);
    $item('#addressEditInput').value = addressInputValue;

    $item('#addressValidationMessage').hide();
  }

  function validateAddressCompleteness($item) {
    const addressInput = $item('#addressEditInput');
    const saveBtn = $item('#addressEditSaveBtn');
    const validationMessage = $item('#addressValidationMessage');

    const addressValue = addressInput.value;

    if (!addressValue) {
      showAddressValidationError(validationMessage, saveBtn, 'Please provide a complete address');
      return false;
    }

    const missingFields = [];

    if (!addressValue.streetAddress?.name) {
      missingFields.push('street name');
    }

    if (!addressValue.streetAddress?.number) {
      missingFields.push('street number');
    }

    if (!addressValue.city) {
      missingFields.push('city');
    }

    if (!addressValue.subdivision) {
      missingFields.push('state');
    }

    if (!addressValue.postalCode) {
      missingFields.push('postal code');
    }

    if (!addressValue.location?.latitude || !addressValue.location?.longitude) {
      missingFields.push('valid location details');
    }

    if (missingFields.length > 0) {
      const message = `Please provide: ${missingFields.join(', ')}`;
      showAddressValidationError(validationMessage, saveBtn, message);
      return false;
    }

    hideAddressValidationError(validationMessage, saveBtn);
    return true;
  }

  function showAddressValidationError(validationMessage, saveBtn, message) {
    validationMessage.text = message;
    validationMessage.show();
    saveBtn.disable();
  }

  function hideAddressValidationError(validationMessage, saveBtn) {
    validationMessage.hide();
    saveBtn.enable();
  }

  function saveAddressFromSingleInput($item, itemData) {
    if (!validateAddressCompleteness($item)) {
      return;
    }

    const addressInput = $item('#addressEditInput');
    const addressValue = addressInput.value;

    const convertedAddress = parseAddressInput(addressValue, itemData.address);

    const formattedAddress = formatFullAddress(convertedAddress);
    $item('#addressItemtext').text = formattedAddress;

    if (itemData.isNewAddress) {
      setNewAddress(itemData._id, convertedAddress);
    } else {
      updateAddress(itemData._id, convertedAddress);
    }

    $item('#addressItemStates').changeState(ADDRESS_STATES.VIEW);
    $item('#addressValidationMessage').hide();
  }

  function removeNewAddressFromRepeater(addressId) {
    const currentData = _$w('#addressesList').data || [];
    const updatedData = currentData.filter(item => item._id !== addressId);
    _$w('#addressesList').data = updatedData;
  }

  function setNewAddress(addressId, addressData) {
    if (!itemMemberObj.addresses) {
      itemMemberObj.addresses = [];
    }
    itemMemberObj.addresses.push(addressData);

    if (!itemMemberObj.addressDisplayOption) {
      itemMemberObj.addressDisplayOption = [];
    }
    itemMemberObj.addressDisplayOption.push({
      key: addressData.key,
      isMain: false,
    });

    checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
  }

  function extractStreetNumber(line1) {
    if (!line1) return '';
    const match = line1.match(/^\d+/);
    return match ? match[0] : '';
  }

  function extractStreetName(line1) {
    if (!line1) return '';
    return line1.replace(/^\d+\s*/, '').trim();
  }

  function renderAddressesList(updatedAddresses) {
    let addressData = updatedAddresses || [];

    if (!addressData || addressData?.length === 0) {
      const addresses = Array.isArray(itemMemberObj.addresses) ? itemMemberObj.addresses : [];
      const displayOptions = Array.isArray(itemMemberObj.addressDisplayOption)
        ? itemMemberObj.addressDisplayOption
        : [];

      addressData = addresses.map((address, index) => {
        const displayOption = displayOptions.find(opt => opt.key === address.key);
        return {
          _id: address.key || `address_${index}`,
          address,
          isMain: displayOption?.isMain || false,
          addressStatus: address.addressStatus || FALLBACK_ADDRESS_STATUS,
          isNewAddress: false,
        };
      });
    }

    const repeater = _$w('#addressesList');
    repeater.data = addressData;

    updateAddressAddButtonState();
  }

  function updateAddressAddButtonState() {
    const currentData = _$w('#addressesList').data || [];
    const newAddressButton = _$w('#newAddressButton');

    if (currentData.length >= MAX_ADDRESSES_COUNT) {
      newAddressButton.disable();
    } else {
      newAddressButton.enable();
    }
  }

  function updateMainAddressSelection(selectedId) {
    if (!itemMemberObj.addressDisplayOption) {
      itemMemberObj.addressDisplayOption = [];
    }

    itemMemberObj.addressDisplayOption.forEach(option => {
      option.isMain = false;
    });

    const selectedOption = itemMemberObj.addressDisplayOption.find(opt => opt.key === selectedId);

    selectedOption.isMain = true;
  }

  function updateAddressStatus(addressId, newStatus) {
    const addresses = Array.isArray(itemMemberObj.addresses) ? itemMemberObj.addresses : [];
    const addressIndex = addresses.findIndex(
      addr => (addr.key || `address_${addresses.indexOf(addr)}`) === addressId
    );

    if (addressIndex !== -1) {
      itemMemberObj.addresses[addressIndex].addressStatus = newStatus;
    }
  }

  function updateAddress(addressId, newAddressValue) {
    const addresses = Array.isArray(itemMemberObj.addresses) ? itemMemberObj.addresses : [];
    const addressIndex = addresses.findIndex(
      addr => (addr.key || `address_${addresses.indexOf(addr)}`) === addressId
    );

    if (addressIndex !== -1) {
      itemMemberObj.addresses[addressIndex] = {
        ...itemMemberObj.addresses[addressIndex],
        ...newAddressValue,
      };

      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    }
  }

  function removeAddress(addressId) {
    if (itemMemberObj.addresses) {
      itemMemberObj.addresses = itemMemberObj.addresses.filter(
        addr => (addr.key || `address_${itemMemberObj.addresses.indexOf(addr)}`) !== addressId
      );
    }

    if (itemMemberObj.addressDisplayOption) {
      itemMemberObj.addressDisplayOption = itemMemberObj.addressDisplayOption.filter(
        opt => opt.key !== addressId
      );
    }

    renderAddressesList();
    checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
  }

  function formatFullAddress(addr) {
    if (!addr) return '';

    const parts = [];

    if (addr.line1) parts.push(addr.line1);
    if (addr.city) parts.push(addr.city);
    if (addr.state && addr.postalcode) {
      parts.push(`${addr.state} ${addr.postalcode}`);
    } else if (addr.state) {
      parts.push(addr.state);
    } else if (addr.postalcode) {
      parts.push(addr.postalcode);
    }

    return parts.join(', ') || 'No address entered';
  }

  function setupPhoneRepeater() {
    _$w('#phoneNumbersList').onItemReady(handlePhoneItem);
    renderPhonesList();

    _$w('#addPhoneButton').onClick(addNewPhone);

    setupPhoneRepeaterEventListeners();
  }

  function setupPhoneRepeaterEventListeners() {
    _$w('#phoneInput').onInput(event => {
      const data = _$w('#phoneNumbersList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const phoneValue = event.target.value;

      updatePhoneNumber(clickedItemData._id, phoneValue);

      if (clickedItemData.isNewPhone && phoneValue.trim()) {
        addNewPhoneToData(clickedItemData._id, phoneValue.trim());
        clickedItemData.isNewPhone = false;
      }

      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });

    _$w('#showPhoneCheckbox').onChange(event => {
      const data = _$w('#phoneNumbersList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const $item = _$w.at(event.context);

      _$w('#showPhoneCheckbox').checked = false;
      $item('#showPhoneCheckbox').checked = true;

      updateShowPhoneSelection(clickedItemData._id, event.target.checked);
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });

    _$w('#removePhoneBtn').onClick(async event => {
      const data = _$w('#phoneNumbersList').data;
      const clickedItemData = data.find(item => item._id === event.context.itemId);
      const result = await wixWindow.openLightbox(LIGHTBOX_NAMES.DELETE_CONFIRM);
      if (result && result.toDelete) {
        removePhone(clickedItemData._id);
      }
    });
  }

  function addNewPhone() {
    const currentData = _$w('#phoneNumbersList').data || [];

    if (currentData.length >= MAX_PHONES_COUNT) {
      return;
    }

    const newPhoneId = generateId();
    const newPhoneItem = {
      _id: newPhoneId,
      phoneNumber: '',
      showPhone: false,
      isNewPhone: true,
      phoneIndex: currentData.length + 1,
    };

    renderPhonesList([...currentData, newPhoneItem]);
  }

  function handlePhoneItem($item, itemData) {
    $item('#phoneInput').value = itemData.phoneNumber || '';
    $item('#showPhoneCheckbox').checked = itemData.showPhone || false;
    $item('#phoneNumberLabel').text = `Phone ${itemData.phoneIndex}`;
  }

  function renderPhonesList(updatedPhones) {
    let phoneData = updatedPhones || [];

    if (!phoneData || phoneData?.length === 0) {
      const phones = Array.isArray(itemMemberObj.phones) ? itemMemberObj.phones : [];

      phoneData = phones.map((phone, index) => ({
        _id: `phone_${index}`,
        phoneNumber: phone,
        showPhone: phone === itemMemberObj.toShowPhone,
        isNewPhone: false,
        phoneIndex: index + 1,
      }));
    }

    const repeater = _$w('#phoneNumbersList');

    repeater.data = phoneData;
    updatePhoneAddButtonState();
  }

  function updatePhoneAddButtonState() {
    const currentData = _$w('#phoneNumbersList').data || [];
    const addPhoneButton = _$w('#addPhoneButton');

    if (currentData.length >= MAX_PHONES_COUNT) {
      addPhoneButton.disable();
    } else {
      addPhoneButton.enable();
    }
  }

  function updatePhoneNumber(phoneId, newPhoneNumber) {
    const currentData = _$w('#phoneNumbersList').data || [];
    const itemIndex = currentData.findIndex(item => item._id === phoneId);

    if (itemIndex !== -1) {
      currentData[itemIndex].phoneNumber = newPhoneNumber;
      renderPhonesList(currentData);
      syncPhonesFromRepeater();
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    }
  }

  function syncPhonesFromRepeater() {
    const phoneData = _$w('#phoneNumbersList').data || [];
    itemMemberObj.phones = phoneData
      .filter(item => !item.isNewPhone && item.phoneNumber.trim())
      .map(item => item.phoneNumber);
  }

  function addNewPhoneToData(phoneId, phoneNumber) {
    if (!itemMemberObj.phones) {
      itemMemberObj.phones = [];
    }

    itemMemberObj.phones.push(phoneNumber);
    renderPhonesList();
    checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
  }

  function removePhone(phoneId) {
    const currentData = _$w('#phoneNumbersList').data || [];
    const phoneToRemove = currentData.find(item => item._id === phoneId);

    if (phoneToRemove) {
      if (itemMemberObj.toShowPhone === phoneToRemove.phoneNumber) {
        itemMemberObj.toShowPhone = null;
      }

      const updatedData = currentData.filter(item => item._id !== phoneId);
      renderPhonesList(updatedData);
    }
  }

  function updateShowPhoneSelection(phoneId, isVisible) {
    const currentData = _$w('#phoneNumbersList').data || [];
    const selectedItem = currentData.find(item => item._id === phoneId);

    if (selectedItem && selectedItem.phoneNumber) {
      if (isVisible) {
        itemMemberObj.toShowPhone = selectedItem.phoneNumber;
      } else {
        itemMemberObj.toShowPhone = null;
      }
    }
  }

  function getToShowPhone() {
    return itemMemberObj.toShowPhone || null;
  }

  function getContactAndBookingData() {
    const showWixUrl = _$w('#showUrlWixCheckbox').checked;
    const showExistingUrl = _$w('#showExsistingUrlCheckbox').checked;

    const addresses = Array.isArray(itemMemberObj.addresses) ? itemMemberObj.addresses : [];
    const phones = Array.isArray(itemMemberObj.phones) ? itemMemberObj.phones : [];

    return {
      showContactForm: _$w('#showCotactFormCheckbox').checked,
      contactFormEmail: _$w('#contactFormEmailInput').value,
      toShowPhone: getToShowPhone(),
      bookingUrl: _$w('#schedulingLinkInput').value,
      website: _$w('#UrlInput').value,
      showWebsite: showExistingUrl,
      showWixUrl,
      addresses,
      addressDisplayOption: itemMemberObj.addressDisplayOption || [],
      phones,
    };
  }

  async function saveContactBooking() {
    // if showWixUrl value changes then update optWebsiteCheckbox value
    _$w('#optWebsiteCheckbox').checked = itemMemberObj.showWixUrl;

    const beforeData = JSON.parse(JSON.stringify(itemMemberObj));
    const contactChanges = getContactAndBookingData();

    const formData = {
      ...itemMemberObj,
      ...contactChanges,
    };

    // Log the specific contact & booking data changes
    console.group('Contact & Booking Save Attempt');
    console.log('Current Data:', beforeData);
    console.log('Changes Being Applied:', contactChanges);
    console.log('Final Form Data:', formData);
    console.log('Address Changes:', {
      addressCount: contactChanges.addresses?.length || 0,
      addressDisplayOptions: contactChanges.addressDisplayOption,
    });
    console.log('Phone Selection:', contactChanges.toShowPhone);
    console.groupEnd();

    const result = await saveData(formData);
    formHasUnsavedChanges[FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section] = false;
    handleSaveDataFeedback(_$w('#contactMessage'), result.message);
  }

  function handleSaveDataFeedback($messageElement, message) {
    $messageElement.text = message;
    $messageElement.expand();
    setTimeout(() => {
      $messageElement.collapse();
    }, 5000);
  }

  function setGallery() {
    // Initialize gallery array if it doesn't exist
    if (!itemMemberObj.gallery) {
      itemMemberObj.gallery = [];
    }
    const gallery = itemMemberObj.gallery;

    const galleryData = buildGalleryData(gallery);

    _$w('#galleryRepeater').data = galleryData;
  }

  function buildGalleryData(gallery) {
    return [
      { _id: 'add-item', isAdd: true },
      ...gallery.map(image => ({
        _id: generateId(),
        image,
        isAdd: false,
      })),
    ];
  }

  function handleGalleryItem($item, itemData) {
    const multiStateBox = $item('#galleryMSB');

    if (itemData.isAdd) {
      setupAddImageState($item, multiStateBox);
    } else {
      setupImageState($item, itemData, multiStateBox);
    }
  }

  function setupAddImageState($item, multiStateBox) {
    multiStateBox.changeState(GALLERY_STATES.ADD);
  }

  function setupImageState($item, itemData, multiStateBox) {
    multiStateBox.changeState(GALLERY_STATES.VIEW);
    $item('#galleryImage').src = itemData.image.src;
  }

  async function saveGalleryToCMS() {
    const formData = {
      ...itemMemberObj,
      gallery: itemMemberObj.gallery,
    };

    await saveData(formData);
  }

  function formatFileName(fullName, maxBaseLength = 23) {
    const dotIndex = fullName.lastIndexOf('.');
    if (dotIndex === -1 || fullName.length <= maxBaseLength + 4) return fullName;

    const name = fullName.slice(0, dotIndex);
    const ext = fullName.slice(dotIndex);
    return `${name.slice(0, maxBaseLength)}...${ext}`;
  }

  async function filterInterests(searchValue) {
    const container = _$w('#containerRepeaterInterest');
    const repeater = _$w('#repeaterInterest');

    const allInterests = await getInterestAll();
    const filtered = allInterests
      .filter(val => val.toLowerCase().includes(searchValue))
      .map(val => ({ _id: generateId(), value: val }));

    if (filtered.length > 0) {
      repeater.data = filtered;
      container.expand();
    } else {
      repeater.data = [];
      container.collapse();
    }

    return filtered;
  }
}

module.exports = {
  personalDetailsOnReady,
};
