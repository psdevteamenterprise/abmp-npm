const TESTIMONIALS_PER_PAGE_CONFIG = {
  DESKTOP: 4,
  TABLET: 2,
  MOBILE: 1,
};

const BREAKPOINTS = {
  DESKTOP: 1301,
  TABLET: 750,
};

function profileOnReady({
  $w: _$w,
  profileData,
  openLightbox,
  getBoundingRect,
  wixLocation,
  generateId,
  prepareText,
}) {
  let testimonialsPerPage = TESTIMONIALS_PER_PAGE_CONFIG.TABLET;
  let currentTestimonialPage = 0;

  console.log('profileData', profileData);

  if (!profileData) {
    wixLocation.to(`${wixLocation.baseUrl}/404`);
    return;
  }

  initializePage();

  function initializePage() {
    bindProfileData();
    setupAddressToggle();
    setupResponsiveTestimonials();
  }

  // Profile data binding
  function bindProfileData() {
    bindAddressData();
    bindMemberInfo();
    bindContactInfo();
    bindBusinessInfo();
    bindGalleryData();
    bindTestimonialsData();
  }

  function bindAddressData() {
    if (profileData.mainAddress) {
      setTextForElements(
        ['#LocationText', '#LocationText2', '#LocationText3'],
        profileData.mainAddress
      );
    } else {
      collapseElements(['#locationContainer', '#location1Container', '#locationContainer2']);
    }

    setupAdditionalAddresses();
  }

  function setupAdditionalAddresses() {
    _$w('#moreAdressesRepeater').data = profileData.processedAddresses;

    if (profileData.processedAddresses.length > 0) {
      _$w('#moreLocationButton').expand();
      _$w('#addressTitle').collapse();
    }

    _$w('#moreAdressesRepeater').onItemReady(($item, itemData) => {
      console.log('Item Data:', itemData);
      $item('#adressText').text = itemData.address || '';
    });
  }

  function setupAddressToggle() {
    toggleContainer('#moreLocationButton', '#addressContainer');
  }

  function toggleContainer(buttonId, containerId) {
    const $button = _$w(buttonId);
    const $container = _$w(containerId);

    $button.onClick(() => {
      const isCollapsed = $container.collapsed;
      $container[isCollapsed ? 'expand' : 'collapse']();
      $button.label = isCollapsed ? 'Less Locations  -' : 'More Locations  +';
    });
  }

  function bindMemberInfo() {
    bindMemberSince();
    bindStudentBadge();
    bindProfileImages();
    bindFullName();
  }

  function bindMemberSince() {
    if (profileData.memberSince) {
      _$w('#sinceYearText').text = profileData.memberSince;
    } else {
      _$w('#memberSinceBox').collapse();
    }
  }

  function bindStudentBadge() {
    if (profileData.shouldHaveStudentBadge) {
      _$w('#studentContainer, #studentContainerMobile').expand();
    } else {
      _$w('#studentContainer, #studentContainerMobile').collapse();
    }
  }

  function bindProfileImages() {
    if (profileData.logoImage) {
      _$w('#logoImage').src = profileData.logoImage;
    } else {
      _$w('#logoImage').collapse();
    }

    if (profileData.profileImage) {
      _$w('#profileImage').src = profileData.profileImage;
    } else {
      _$w('#profileImage').src =
        'https://static.wixstatic.com/media/1d7134_e052e9b1d0a543d0980650e16dd6d374~mv2.jpg';
    }
  }

  function bindFullName() {
    if (profileData.fullName) {
      setTextForElements(
        ['#fullNameText', '#fullNameText2', '#fullNameTextFoter'],
        profileData.fullName
      );
    } else {
      collapseElements(['#fullNameText', '#fullNameText2', '#fullNameTextFoter']);
    }
  }

  // Contact information binding
  function bindContactInfo() {
    bindContactForm();
    bindBookingUrl();
    bindPhoneNumber();
    bindLicenseNumber();
  }

  function bindContactForm() {
    if (profileData.showContactForm) {
      _$w('#contactButton').onClick(() => openLightbox('Contact Us', profileData));
    } else {
      _$w('#contactButton').collapse();
    }
  }

  function bindBookingUrl() {
    if (profileData.bookingUrl) {
      _$w('#bookNowButton').link = profileData.bookingUrl;
    } else {
      _$w('#bookNowButton').collapse();
    }
  }

  function bindPhoneNumber() {
    if (profileData.phone) {
      const formattedPhoneNumber = profileData.phone.replace(/[^\d+]/g, '');
      const getPhoneHTML = $phoneSelector =>
        $phoneSelector.html.replace(
          $phoneSelector.text,
          `<a href="${`tel:${formattedPhoneNumber}`}">${profileData.phone}</a>`
        );
      _$w('#phoneText').html = getPhoneHTML(_$w('#phoneText'));
      _$w('#phoneText2').html = getPhoneHTML(_$w('#phoneText2'));
    } else {
      collapseElements(['#phoneContainer', '#phoneContainer2']);
    }
  }

  function bindLicenseNumber() {
    if (profileData.licenceNo) {
      _$w('#licenceNoText').text = profileData.licenceNo;
    } else {
      _$w('#licensesContainer').collapse();
    }
  }

  function bindBusinessInfo() {
    bindAboutService();
    bindBusinessName();
    bindAreasOfPractice();
  }

  function bindAboutService() {
    if (profileData.aboutService) {
      _$w('#aboutYouText').html = profileData.aboutService;
    } else {
      _$w('#aboutSection').collapse();
    }
  }

  function bindBusinessName() {
    if (profileData.businessName) {
      _$w('#businessName').text = profileData.businessName;
      _$w('#businessName').expand();
    } else {
      _$w('#businessName').collapse();
    }
  }

  function bindAreasOfPractice() {
    const areasText = prepareText(profileData.areasOfPractices);

    if (areasText) {
      _$w('#areaOfPracticesText').text = areasText;
    } else {
      _$w('#areaOfPracticesText').collapse();
    }

    if (Array.isArray(profileData.areasOfPractices) && profileData.areasOfPractices.length > 0) {
      populateRepeater(profileData.areasOfPractices, '#areaOfPracticesRepeater', '#practiceText');
    } else {
      _$w('#servicesSection').collapse();
    }
  }

  function bindGalleryData() {
    if (profileData.bannerImages && profileData.bannerImages.length > 0) {
      _$w('#bannerImage').src = profileData.bannerImages[0];
    }

    if (!profileData.gallery?.length) {
      _$w('#gallerySection').collapse();
    } else {
      _$w('#gallery').items = profileData.gallery;
      _$w('#gallerySection').expand();
    }
  }

  function bindTestimonialsData() {
    if (!profileData.testimonials?.length) {
      _$w('#testimonialsSection').collapse();
    }
  }

  // Responsive testimonials setup
  async function setupResponsiveTestimonials() {
    const { window } = await getBoundingRect();
    testimonialsPerPage = getTestimonialsPerPage(window.width);

    // Monitor window resize
    setInterval(async () => {
      const { window: win } = await getBoundingRect();
      const newTestimonialsPerPage = getTestimonialsPerPage(win.width);

      if (newTestimonialsPerPage !== testimonialsPerPage) {
        testimonialsPerPage = newTestimonialsPerPage;
        currentTestimonialPage = 0;
        displayTestimonialsPage(profileData.testimonials);
      }
    }, 500);

    setupTestimonialsIfAvailable();
  }

  function setupTestimonialsIfAvailable() {
    if (profileData.testimonials.length > 0) {
      setupTestimonialsPagination(profileData.testimonials);
      _$w('#testimonialsSection').expand();
    } else {
      _$w('#testimonialsSection').collapse();
    }
  }

  function getTestimonialsPerPage(width) {
    if (width >= BREAKPOINTS.DESKTOP) return TESTIMONIALS_PER_PAGE_CONFIG.DESKTOP;
    if (width >= BREAKPOINTS.TABLET) return TESTIMONIALS_PER_PAGE_CONFIG.TABLET;
    return TESTIMONIALS_PER_PAGE_CONFIG.MOBILE;
  }

  function setTextForElements(elementIds, text) {
    elementIds.forEach(id => {
      _$w(id).text = text;
    });
  }

  function collapseElements(elementIds) {
    elementIds.forEach(id => {
      _$w(id).collapse();
    });
  }

  function populateRepeater(data, repeaterId, textElementId) {
    const repeaterData = data.map(item => ({
      _id: generateId(),
      text: item.trim(),
    }));
    _$w(repeaterId).data = repeaterData;
    _$w(repeaterId).onItemReady(($item, itemData) => {
      $item(textElementId).text = itemData.text;
    });
  }

  // Testimonials pagination
  function setupTestimonialsPagination(allTestimonials) {
    currentTestimonialPage = 0;

    _$w('#prevTestimonialBtn').onClick(() => {
      if (currentTestimonialPage > 0) {
        currentTestimonialPage--;
        displayTestimonialsPage(allTestimonials);
      }
    });

    _$w('#nextTestimonialBtn').onClick(() => {
      const maxPage = Math.floor((allTestimonials.length - 1) / testimonialsPerPage);
      if (currentTestimonialPage < maxPage) {
        currentTestimonialPage++;
        displayTestimonialsPage(allTestimonials);
      }
    });

    displayTestimonialsPage(allTestimonials);
  }

  function displayTestimonialsPage(allTestimonials) {
    const start = currentTestimonialPage * testimonialsPerPage;
    const end = start + testimonialsPerPage;
    const currentBatch = allTestimonials.slice(start, end);

    populateRepeater(currentBatch, '#testimonialsrepeater', '#testimonialText');
    updateTestimonialNavigation(end, allTestimonials.length);
  }

  function updateTestimonialNavigation(end, totalLength) {
    _$w('#prevTestimonialBtn').hide();
    _$w('#nextTestimonialBtn').hide();

    if (currentTestimonialPage > 0) {
      _$w('#prevTestimonialBtn').show();
    }

    if (end < totalLength) {
      _$w('#nextTestimonialBtn').show();
    }
  }
}

module.exports = {
  profileOnReady,
};
