const _ = require('lodash');

const {
  ABMP_MEMBERS_HOME_URL,
  DEFAULT_BUSINESS_NAME_TEXT,
  FREE_WEBSITE_TEXT_STATES,
  LIGHTBOX_NAMES,
} = require('../public');

const MAX_PHONES_COUNT = 4;
let itemMemberObj = {};
let originalMemberData = {};
let selectedServices = [];
let uploadedImages = {
  profileImage: '',
  logoImage: '',
  bannerImage: '',
};
const MAIN_STATE_BOX_STATES = {
  FORM_STATE: 'formState',
  UNAUTHORIZED_STATE: 'unauthorizedState',
  ERROR_STATE: 'errorState',
};

const FORM_SECTION_HANDLER_MAP = {
  PERSONAL: { section: 'personal', handler: null },
  BUSINESS_SERVICES: { section: 'businessServices', handler: null },
  CONTACT_BOOKING: { section: 'contactBooking', handler: null },
  DIRECTORY_OPT_OUT: { section: 'directoryOptOut', handler: null },
  WEBSITE_OPT_OUT: { section: 'websiteOptOut', handler: null },
};
let formHasUnsavedChanges = {
  [FORM_SECTION_HANDLER_MAP.PERSONAL.section]: false,
  [FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.section]: false,
  [FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section]: false,
  [FORM_SECTION_HANDLER_MAP.DIRECTORY_OPT_OUT.section]: false,
  [FORM_SECTION_HANDLER_MAP.WEBSITE_OPT_OUT.section]: false,
};

async function personalDetailsFormOnReady({
  $w: _$w,
  wixLocationFrontend,
  wixWindow,
  local,
  validateMemberToken,
  saveRegistrationData,
  getInterestAll,
  generateId,
  handleOnCustomValidation,
  isNotValidUrl,
}) {
  const showUnauthorizedState = () => {
    console.log('❌ Unauthorized');
    _$w('#mainMultiStateBox').changeState(MAIN_STATE_BOX_STATES.UNAUTHORIZED_STATE);
  };

  // Set up handler functions with closures
  FORM_SECTION_HANDLER_MAP.PERSONAL.handler = () => checkPersonalDataChanged();
  FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.handler = () => checkBusinessDataChanged();
  FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.handler = () => checkContactDataChanged();
  FORM_SECTION_HANDLER_MAP.DIRECTORY_OPT_OUT.handler = () => checkDirectoryOptOutDataChanged();
  FORM_SECTION_HANDLER_MAP.WEBSITE_OPT_OUT.handler = () => checkWebsiteOptOutDataChanged();

  let memberData, isValid, isStudent;

  const memberTokenId = wixLocationFrontend.query.token;
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
        wixWindow.openLightbox(LIGHTBOX_NAMES.SAVE_ALERT);
      } else {
        wixLocationFrontend.to(ABMP_MEMBERS_HOME_URL);
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  });

  itemMemberObj = memberData;
  originalMemberData = JSON.parse(JSON.stringify(memberData));
  selectedServices = Array.isArray(itemMemberObj.areasOfPractices)
    ? itemMemberObj.areasOfPractices.map((label) => ({ _id: generateId(), label: String(label) }))
    : [];

  _$w('#mainMultiStateBox').changeState(MAIN_STATE_BOX_STATES.FORM_STATE);
  init();
  setupStepTrackingWrapper();
  
  // Custom checkbox group for phones
  Array.from({ length: MAX_PHONES_COUNT }, (_, i) => i + 1).forEach((i) => {
    _$w(`#showPhoneCheckbox${i}`).onChange((e) => {
      Array.from({ length: MAX_PHONES_COUNT }, (_, j) => j + 1).forEach((j) => {
        if (j !== i) {
          _$w(`#showPhoneCheckbox${j}`).checked = false;
        }
      });
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });
  });
  
  // Initially disable save buttons
  _$w('#savePersonalButton').disable();
  _$w('#saveBusinessButton').disable();
  _$w('#saveContactBookingButton').disable();
  onFormDataChanged();

  // Helper functions
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
    const fullProfilePageLink = `${wixLocationFrontend.baseUrl}/profile/${itemMemberObj.url}`;
    setPersonalDetails(fullProfilePageLink);
    setBusinessServices();
    setContactBooking(fullProfilePageLink);
    initGallery();
  }

  function initGallery() {
    _$w('#galleryRepeater').onItemReady(handleGalleryItem);
    _$w('#uploadGalleryImageButton').onChange(async (event) => {
      const $item = _$w.at(event.context);
      const uploadButton = $item('#uploadGalleryImageButton');
      if (uploadButton.value.length === 0) return;
      try {
        const uploadedFiles = await uploadButton.uploadFiles();
        if (!itemMemberObj.gallery) {
          itemMemberObj.gallery = [];
        }
        uploadedFiles.forEach((file) => {
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
    _$w('#deleteImageButton').onClick(async (event) => {
      const itemId = event.context.itemId;
      const itemData = _$w('#galleryRepeater').data.find((item) => item._id === itemId);
      const result = await wixWindow.openLightbox('deleteConfirm');
      if (result && result.toDelete) {
        itemMemberObj.gallery = itemMemberObj.gallery.filter((img) => img.src !== itemData.image.src);
        await saveGalleryToCMS();
        setGallery();
      }
    });
    setGallery();
  }

  function setPersonalDetails(fullProfilePageLink) {
    _$w('#firstNameInput').value = itemMemberObj.firstName || '';
    _$w('#lastNameInput').value = itemMemberObj.lastName || '';

    _$w('#profileLink').text = fullProfilePageLink;
    _$w('#profileLink').link = fullProfilePageLink;
    _$w('#profileLink').target = '_blank';
    _$w('#licenceNoText').text = (itemMemberObj.licenses || [])
      .map((val) => val.license)
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
      (confirmed) =>
        handleOptConfirmation(confirmed, '#optCheckbox', '#optConfirmationBox', 'optOut')
    );

    setupOptOutCheckbox(
      '#optWebsiteCheckbox',
      '#optWebsiteConfirmationBox',
      '#yesOptWebsiteButton',
      '#cancelOptwebsiteButton',
      (confirmed) =>
        handleOptConfirmation(confirmed, '#optWebsiteCheckbox', '#optWebsiteConfirmationBox', 'showWixUrl')
    );
  }

  function setupOptOutCheckbox(checkboxId, confirmationBoxId, confirmBtnId, cancelBtnId, confirmCallback) {
    const checkbox = _$w(checkboxId);
    const box = _$w(confirmationBoxId);

    checkbox.onChange((e) => {
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
    };
    const formChangeEventBindings = {
      [FORM_SECTION_HANDLER_MAP.PERSONAL.section]: [
        { $elem: elements.$firstNameInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
        { $elem: elements.$lastNameInput, changeEvent: CHANGE_EVENTS.ON_INPUT },
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
    Object.keys(formChangeEventBindings).forEach((section) => {
      formChangeEventBindings[section].forEach(({ $elem, changeEvent }) => {
        $elem[changeEvent](() => {
          const handlerMap = Object.values(FORM_SECTION_HANDLER_MAP).find(
            (handlerMap) => handlerMap.section === section
          );
          checkFormChanges(handlerMap);
        });
      });
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
        isNameValid = true;
      if (formDataType === FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section) {
        isEmailValid = _$w('#contactFormEmailInput').valid;
        isUrlValid =
          !isNotValidUrl(_$w('#UrlInput').value) && !isNotValidUrl(_$w('#schedulingLinkInput').value);
      }
      if (formDataType === FORM_SECTION_HANDLER_MAP.PERSONAL.section) {
        isNameValid = _$w('#firstNameInput').valid && _$w('#lastNameInput').valid;
      }

      if (isFormDataChanged && isUrlValid && isEmailValid && isNameValid) {
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

    const memberships = Array.isArray(itemMemberObj.memberships) ? itemMemberObj.memberships : [];
    const abmp = memberships.find((m) => m.association === 'ABMP');
    if (abmp && abmp.membersince) {
      _$w('#yearJoinedText').text = abmp.membersince;
    } else {
      _$w('#yearJoinedText').text = 'Year joined not provided';
    }

    uploadImageFromLightbox();
    setupImageUploadAndDeleteHandlers();
    setupServiceSelection();
    setInterestData();
    setupTestimonials();

    if (!itemMemberObj.areasOfPractices) {
      itemMemberObj.areasOfPractices = [];
    }

    if (Array.isArray(itemMemberObj.areasOfPractices)) {
      selectedServices = itemMemberObj.areasOfPractices.map((label) => ({
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
          uploadedFiles.forEach((file) => {
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
      const returnedImage = await wixWindow.openLightbox('Select Banner Images');
      console.log('uploadedImages', returnedImage);

      if (returnedImage && returnedImage.image) {
        console.log('Image returned from lightbox:', returnedImage);
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
    uploadImage('#uploadProfileButton', 'profileImage', (file) => {
      _$w('#profileImage').src = file.fileUrl;
      _$w('#profileImageName').text = formatFileName(file.fileName);
      _$w('#profileImageContainer').expand();
    });

    uploadImage('#uploadLogoButton', 'logoImage', (file) => {
      _$w('#logoImage').src = file.fileUrl;
      _$w('#logoImageName').text = file.fileName;
      _$w('#logoImageContainer').expand();
    });

    uploadImage('#uploadBannerButton', 'bannerImage', (file) => {
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
      const result = await wixWindow.openLightbox('deleteConfirm');

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
    const result = await wixWindow.openLightbox('deleteConfirm');

    if (result && result.toDelete) {
      const $clickedItem = _$w.at(event.context);
      const textToRemove = $clickedItem(getTextSelector).text;

      arrayRef.splice(
        0,
        arrayRef.length,
        ...arrayRef.filter((item) =>
          typeof item === 'string' ? item !== textToRemove : item[matchField] !== textToRemove
        )
      );

      renderFn();
      checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
    }
  }

  async function setInterestData() {
    const interestsData = await getInterestAll();

    _$w('#removeServiceButton').onClick((event) => {
      handleItemDelete(event, '#serviceNameText', selectedServices, 'label', renderServices);
    });

    if (Array.isArray(interestsData) && interestsData.length > 0) {
      const formattedData = interestsData.map((val, index) => ({
        _id: String(index),
        value: val,
      }));

      _$w('#repeaterInterest').data = formattedData;
      _$w('#repeaterInterest').onItemReady(($item, itemData, index) => {
        $item('#interestText').text = itemData.value;
      });
    }
  }

  async function setupServiceSelection() {
    const intrestInput = _$w('#intrestInput');
    intrestInput.onClick(async () => {
      if (intrestInput.value) {
        intrestInput.onClick(async () => {
          await filterInterests(intrestInput.value);
        });
      } else {
        setInterestData();
      }
      _$w('#containerRepeaterInterest').expand();
    });

    intrestInput.onKeyPress((event) => {
      debounce_fun();

      if (event.key === 'Enter') {
        const typedValue = intrestInput.value.trim();

        if (
          typedValue &&
          !selectedServices.some((service) => service.label.toLowerCase() === typedValue.toLowerCase())
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
        if (!selectedServices.some((service) => service.label === itemData.value)) {
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

  async function saveData(formData) {
    const memberId = local.getItem('memberId');
    const { type, saveData: saved } = await saveRegistrationData(formData, memberId);

    if (type === 'success') {
      itemMemberObj = { ...saved };
      originalMemberData = JSON.parse(JSON.stringify(saved));
      return 'The information was saved successfully.';
    } else {
      return "It looks like something went wrong — the information wasn't saved. Please try again later.";
    }
  }

  function getPersonalData() {
    const firstName = _$w('#firstNameInput').value.trim();
    const lastName = _$w('#lastNameInput').value.trim();
    const fullName = `${firstName} ${lastName}`.trim();

    return {
      firstName,
      lastName,
      fullName,
    };
  }

  function checkPersonalDataChanged() {
    const currentPersonalData = getPersonalData();
    const originalPersonalData = {
      firstName: originalMemberData.firstName || '',
      lastName: originalMemberData.lastName || '',
      fullName: originalMemberData.fullName || '',
    };
    return !_.isEqual(currentPersonalData, originalPersonalData);
  }

  function getBusinessAndServicesData() {
    const getCurrentTestimonials = () =>
      _$w('#testimonialRepeater')
        .data.filter((item) => item.isAdd === false)
        .map((item) => item.text)
        .filter(Boolean) || itemMemberObj.testimonial;

    return {
      showBusinessName: _$w('#businessNameCheckbox').checked,
      businessName: _$w('#businessNameInput').value,
      showABMP: _$w('#yearJoinedcheckbox').checked,
      profileImage: uploadedImages.profileImage,
      logoImage: uploadedImages.logoImage,
      bannerImages: uploadedImages.bannerImage ? [uploadedImages.bannerImage] : [],
      areasOfPractices: selectedServices.map((service) => service.label),
      aboutService: _$w('#aboutInput').value,
      testimonial: getCurrentTestimonials(),
    };
  }

  async function savePersonalDetails() {
    const formData = {
      ...itemMemberObj,
      ...getPersonalData(),
    };
    const message = await saveData(formData);
    formHasUnsavedChanges[FORM_SECTION_HANDLER_MAP.PERSONAL.section] = false;
    handleSaveDataFeedback(_$w('#personalMessage'), message);
  }

  async function saveBusinessServices() {
    const formData = {
      ...itemMemberObj,
      ...getBusinessAndServicesData(),
    };
    const message = await saveData(formData);
    formHasUnsavedChanges[FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES.section] = false;
    handleSaveDataFeedback(_$w('#businessMessage'), message);
    _$w('#businessNameText').text = formData.businessName || DEFAULT_BUSINESS_NAME_TEXT;
  }

  function setupTestimonials() {
    const addTestimonialButton = _$w('#addTestimonialButton');

    addTestimonialButton.onClick(handleAddTestimonial);
    _$w('#deleteTestimonialButton').onClick((event) => {
      handleItemDelete(event, '#testimonialText', itemMemberObj.testimonial, null, renderTestimonials);
    });

    renderTestimonials();
    _$w('#testimonialRepeater').onItemReady(($item, itemData) => {
      const msb = $item('#testimonialMSB');
      if (itemData.isAdd) {
        msb.changeState('addTestimonialState');
      } else {
        msb.changeState('testimonialState');
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
      ...testimonials.map((text) => ({ _id: generateId(), text, isAdd: false })),
    ];

    setupRepeater('#testimonialRepeater', testimonialData);
  }

  function handleAddTestimonial(event) {
    const $clickedItem = _$w.at(event.context);
    const input = $clickedItem('#testimonialsInput');
    const newText = input.value;

    if (newText?.trim()) {
      if (!itemMemberObj.testimonial) {
        itemMemberObj.testimonial = [];
      }
      itemMemberObj.testimonial.push(newText.trim());
      input.value = '';
      renderTestimonials();
      checkFormChanges(FORM_SECTION_HANDLER_MAP.BUSINESS_SERVICES);
    }
  }

  function setPhones(phones, toShowPhone) {
    if (
      !phones ||
      !Array.isArray(phones) ||
      (Array.isArray(phones) && phones.length === 0)
    ) {
      _$w('#allPhonesContainer').collapse();
      return;
    }
    for (let i = 1; i < MAX_PHONES_COUNT + 1; i++) {
      if (i <= phones.length) {
        _$w(`#showPhoneCheckbox${i}`).checked = phones[i - 1] === toShowPhone;
        _$w(`#phone${i}Text`).text = phones[i - 1];
        _$w(`#phoneContainer${i}`).expand();
      } else {
        _$w(`#phoneContainer${i}`).collapse();
      }
    }
    _$w('#allPhonesContainer').expand();
  }

  function setContactBooking(fullProfilePageLink) {
    const showWixUrlCheckbox = !itemMemberObj.showWebsite && itemMemberObj.showWixUrl;
    const showExistingUrlCheckbox = itemMemberObj.showWebsite;

    _$w('#showCotactFormCheckbox').checked = itemMemberObj.showContactForm;
    _$w('#contactFormEmailInput').value = itemMemberObj.contactFormEmail;
    setPhones(itemMemberObj.phones, itemMemberObj.toShowPhone);
    _$w('#schedulingLinkInput').value = itemMemberObj.bookingUrl;

    _$w('#UrlInput').value = itemMemberObj.website || '';
    _$w('#showUrlWixCheckbox').checked = showWixUrlCheckbox;
    _$w('#showExsistingUrlCheckbox').checked = showExistingUrlCheckbox;
    _$w('#urlWebsiteText').text = fullProfilePageLink;

    handleOnCustomValidation(_$w('#UrlInput'));
    handleOnCustomValidation(_$w('#schedulingLinkInput'));

    if (showWixUrlCheckbox) {
      _$w('#UrlInput').disable();
      _$w('#urlWebsiteText').customClassList.add('highlighted-text');
    } else if (showExistingUrlCheckbox) {
      _$w('#UrlInput').enable();
      _$w('#urlWebsiteText').customClassList.remove('highlighted-text');
    } else {
      _$w('#UrlInput').disable();
      _$w('#urlWebsiteText').customClassList.remove('highlighted-text');
    }

    _$w('#clearSchedulingLinkInput').onClick(() => {
      _$w('#schedulingLinkInput').value = '';
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });
    _$w('#clearExistingUrlLinkInput').onClick(() => {
      _$w('#UrlInput').value = '';
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });

    _$w('#showUrlWixCheckbox').onChange((e) => {
      if (e.target.checked) {
        _$w('#showExsistingUrlCheckbox').checked = false;
        _$w('#UrlInput').disable();
        _$w('#urlWebsiteText').customClassList.add('highlighted-text');
      }
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });
    _$w('#showExsistingUrlCheckbox').onChange((e) => {
      if (e.target.checked) {
        _$w('#showUrlWixCheckbox').checked = false;
        _$w('#UrlInput').enable();
        _$w('#urlWebsiteText').customClassList.remove('highlighted-text');
      }
      checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
    });

    renderAddressDisplayOptionsFromCMS();
    _$w('#saveContactBookingButton').onClick(saveContactBooking);
  }

  function renderAddressDisplayOptionsFromCMS() {
    const addresses = Array.isArray(itemMemberObj.addresses) ? itemMemberObj.addresses : [];
    const displayOptions = Array.isArray(itemMemberObj.addressDisplayOption)
      ? itemMemberObj.addressDisplayOption
      : [];
    const max = 4;

    for (let i = 0; i < max; i++) {
      const address = addresses[i];
      const box = _$w(`#addressBox${i + 1}`);
      const text = _$w(`#addressText${i + 1}`);
      const checkbox = _$w(`#mainAddress${i + 1}`);
      const radio = _$w(`#radioGroupAddress${i + 1}`);

      if (address) {
        box.expand();
        text.text = formatFullAddress(address);

        const option = displayOptions.find((opt) => opt.key === address.key);
        checkbox.checked = option?.isMain || false;
        radio.value = address.addressStatus;

        checkbox.onChange(() => {
          updateMainCheckbox(i + 1, max);
          checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
        });
        radio.onChange(() => {
          checkFormChanges(FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING);
        });
      } else {
        box.collapse();
      }
    }
  }

  function setAddress() {
    const addresses = Array.isArray(itemMemberObj.addresses) ? itemMemberObj.addresses : [];
    const displayOption = [];

    for (let i = 0; i < addresses.length; i++) {
      const key = addresses[i].key;
      const isMain = _$w(`#mainAddress${i + 1}`).checked;

      displayOption.push({ key, isMain });
    }

    return displayOption;
  }

  function formatFullAddress(addr) {
    return `${addr.line1}, ${addr.city}, ${addr.state} ${addr.postalcode}`;
  }

  function updateMainCheckbox(currentIndex, max) {
    for (let i = 1; i <= max; i++) {
      const checkbox = _$w(`#mainAddress${i}`);
      checkbox.checked = i === currentIndex;
    }
  }

  function getToShowPhone() {
    const phones = itemMemberObj.phones;
    const checkedPhoneIndex = Array.from({ length: phones.length }, (_, i) => i + 1).find((i) =>
      _$w(`#showPhoneCheckbox${i}`).checked
    );
    return phones[checkedPhoneIndex - 1];
  }

  function getContactAndBookingData() {
    const showWixUrl = _$w('#showUrlWixCheckbox').checked;
    const showExistingUrl = _$w('#showExsistingUrlCheckbox').checked;

    const addresses = Array.isArray(itemMemberObj.addresses) ? itemMemberObj.addresses : [];
    const updatedAddresses = addresses.map((address, i) => ({
      ...address,
      addressStatus: _$w(`#radioGroupAddress${i + 1}`).value,
    }));

    return {
      showContactForm: _$w('#showCotactFormCheckbox').checked,
      contactFormEmail: _$w('#contactFormEmailInput').value,
      toShowPhone: getToShowPhone(),
      bookingUrl: _$w('#schedulingLinkInput').value,
      website: _$w('#UrlInput').value,
      showWebsite: showExistingUrl,
      showWixUrl,
      addresses: updatedAddresses,
      addressDisplayOption: setAddress(),
    };
  }

  async function saveContactBooking() {
    _$w('#optWebsiteCheckbox').checked = itemMemberObj.showWixUrl;

    const formData = {
      ...itemMemberObj,
      ...getContactAndBookingData(),
    };
    const message = await saveData(formData);
    formHasUnsavedChanges[FORM_SECTION_HANDLER_MAP.CONTACT_BOOKING.section] = false;
    handleSaveDataFeedback(_$w('#contactMessage'), message);
  }

  function handleSaveDataFeedback($messageElement, message) {
    $messageElement.text = message;
    $messageElement.expand();
    setTimeout(() => {
      $messageElement.collapse();
    }, 5000);
  }

  function setGallery() {
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
      ...gallery.map((image) => ({
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
    multiStateBox.changeState('addImageState');
  }

  function setupImageState($item, itemData, multiStateBox) {
    multiStateBox.changeState('imageState');
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
      .filter((val) => val.toLowerCase().includes(searchValue))
      .map((val) => ({ _id: generateId(), value: val }));

    if (filtered.length > 0) {
      repeater.data = filtered;
      container.expand();
    } else {
      repeater.data = [];
      container.collapse();
    }

    return filtered;
  }

  const debounce_fun = _.debounce(async function () {
    const searchValue = _$w('#intrestInput').value.trim().toLowerCase();
    await filterInterests(searchValue);
  }, 250);
}

module.exports = {
  personalDetailsFormOnReady,
};

