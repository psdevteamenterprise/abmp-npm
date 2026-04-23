const { location: wixLocation } = require('@wix/site-location');
const { seo } = require('@wix/site-seo');
const { window: wixWindow } = require('@wix/site-window');

const { LIGHTBOX_NAMES } = require('../public/consts');
const {
  generateId,
  formatPracticeAreasForDisplay,
  isWixHostedImage,
} = require('../public/Utils/sharedUtils');

const TESTIMONIALS_PER_PAGE_CONFIG = {
  DESKTOP: 4,
  TABLET: 2,
  MOBILE: 1,
};

const BREAKPOINTS = {
  DESKTOP: 1301,
  TABLET: 750,
};

const resolveMemberDataId = memberData => {
  if (!memberData) {
    return null;
  }
  if (typeof memberData === 'string') {
    return memberData;
  }
  return memberData?._id || memberData?._ref || null;
};

async function publicProfileOnReady({
  $w: _$w,
  getPublicMemberProfileData,
  getPublicProfileSeoConfig,
}) {
  const dataset = _$w('#dynamicDataset');
  let profileData = null;

  let testimonialsPerPage = TESTIMONIALS_PER_PAGE_CONFIG.TABLET;
  let currentTestimonialPage = 0;

  if (typeof getPublicMemberProfileData !== 'function') {
    console.error('[publicProfileOnReady] getPublicMemberProfileData is required');
    wixLocation.to(`${wixLocation.baseUrl}/404`);
    return;
  }

  await dataset.onReadyAsync();
  const item = dataset.getCurrentItem();

  if (!item || item.showWixUrl !== true) {
    wixLocation.to(`${wixLocation.baseUrl}/404`);
    return;
  }

  const memberDataId = resolveMemberDataId(item.memberData);
  if (!memberDataId) {
    wixLocation.to(`${wixLocation.baseUrl}/404`);
    return;
  }

  const result = await getPublicMemberProfileData({ memberDataId });
  profileData = result?.profileData || null;

  if (!profileData) {
    wixLocation.to(`${wixLocation.baseUrl}/404`);
    return;
  }

  if (typeof getPublicProfileSeoConfig === 'function') {
    try {
      const seoConfig = await getPublicProfileSeoConfig();
      applySeo(profileData, seoConfig);
    } catch (error) {
      console.error('[publicProfileOnReady] Failed to set SEO', error);
    }
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
      deleteElements(['#locationContainer', '#location1Container', '#locationContainer2']);
    }

    setupAdditionalAddresses();
  }

  function setupAdditionalAddresses() {
    _$w('#moreAdressesRepeater').data = profileData.moreAddressesToDisplay;

    if (profileData.moreAddressesToDisplay.length > 0) {
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
      _$w('#memberSinceBox').delete();
    }
  }

  function bindStudentBadge() {
    if (profileData.shouldHaveStudentBadge) {
      _$w('#studentContainer, #studentContainerMobile').expand();
    } else {
      _$w('#studentContainer, #studentContainerMobile').delete();
    }
  }

  function bindProfileImages() {
    if (profileData.logoImage) {
      _$w('#logoImage').src = profileData.logoImage;
    } else {
      _$w('#logoImage').delete();
    }

    if (profileData.profileImage && isWixHostedImage(profileData.profileImage)) {
      _$w('#profileImage').src = profileData.profileImage;
    } else {
      _$w('#profileImage').src = profileData.defaultProfileImage;
    }
  }

  function bindFullName() {
    if (profileData.fullName) {
      setTextForElements(
        ['#fullNameText', '#fullNameText2', '#fullNameTextFoter'],
        profileData.fullName
      );
    } else {
      deleteElements(['#fullNameText', '#fullNameText2', '#fullNameTextFoter']);
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
      _$w('#contactButton').onClick(() =>
        wixWindow.openLightbox(LIGHTBOX_NAMES.CONTACT_US, profileData)
      );
    } else {
      _$w('#contactButton').delete();
    }
  }

  function bindBookingUrl() {
    if (profileData.bookingUrl) {
      _$w('#bookNowButton').link = profileData.bookingUrl;
    } else {
      _$w('#bookNowButton').delete();
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
      deleteElements(['#phoneContainer', '#phoneContainer2']);
    }
  }

  function bindLicenseNumber() {
    if (profileData.licenceNo) {
      _$w('#licenceNoText').text = profileData.licenceNo;
    } else {
      _$w('#licensesContainer').delete();
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
      _$w('#aboutSection').delete();
    }
  }

  function bindBusinessName() {
    if (profileData.businessName) {
      _$w('#businessName').text = profileData.businessName;
      _$w('#businessName').expand();
    } else {
      _$w('#businessName').delete();
    }
  }

  function bindAreasOfPractice() {
    const areasText = formatPracticeAreasForDisplay(profileData.areasOfPractices);

    if (areasText) {
      _$w('#areaOfPracticesText').text = areasText;
    } else {
      _$w('#areaOfPracticesText').delete();
    }

    if (Array.isArray(profileData.areasOfPractices) && profileData.areasOfPractices.length > 0) {
      populateRepeater(profileData.areasOfPractices, '#areaOfPracticesRepeater', '#practiceText');
    } else {
      _$w('#servicesSection').delete();
    }
  }

  function bindGalleryData() {
    if (profileData.bannerImages && profileData.bannerImages.length > 0) {
      _$w('#bannerImage').src = profileData.bannerImages[0];
    }

    if (!profileData.gallery?.length) {
      _$w('#gallerySection').delete();
    } else {
      _$w('#gallery').items = profileData.gallery;
      _$w('#gallerySection').restore();
    }
  }

  function bindTestimonialsData() {
    if (!profileData.testimonials?.length) {
      _$w('#testimonialsSection').delete();
    }
  }

  // Responsive testimonials setup
  async function setupResponsiveTestimonials() {
    const { window } = await wixWindow.getBoundingRect();
    testimonialsPerPage = getTestimonialsPerPage(window.width);

    // Monitor window resize
    setInterval(async () => {
      const { window: win } = await wixWindow.getBoundingRect();
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
      _$w('#testimonialsSection').delete();
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

  function deleteElements(elementIds) {
    elementIds.forEach(id => {
      _$w(id).delete();
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

  function applySeo(data, config) {
    if (!data || !config) {
      return;
    }
    const { siteAssociation, defaultSEODescription, siteLogoUrl, defaultProfileImage } = config;

    const profileImage =
      data.profileImage?.trim() && isWixHostedImage(data.profileImage)
        ? data.profileImage
        : defaultProfileImage;
    const ogImage = profileImage || data.logoImage || siteLogoUrl;
    const seoTitle = generateSEOTitle({
      fullName: data.fullName,
      areasOfPractices: data.areasOfPractices,
      siteAssociation,
    });
    let description = stripHtmlTags(data.aboutService) || defaultSEODescription || '';
    if (description.length > 160) {
      description = description.substring(0, 157) + '...';
    }
    const profileUrl = data.url
      ? `${wixLocation.baseUrl}/profile/${data.url}`
      : wixLocation.baseUrl;
    const shouldNoIndex = data.isPrivateMember || data.shouldHaveStudentBadge;

    seo.setTitle(seoTitle);
    seo.setMetaTags(
      [
        {
          name: 'description',
          content: description,
        },
        {
          name: 'keywords',
          content:
            `${data.fullName}, ${data.areasOfPractices ? data.areasOfPractices.slice(0, 3).join(', ') : ''}, ${siteAssociation}, ${data.city || ''}, ${data.state || ''}`
              .replace(/,\s*,/g, ',')
              .replace(/^,|,$/g, ''),
        },
        {
          name: 'author',
          content: data.fullName,
        },
        {
          name: 'robots',
          content: shouldNoIndex ? 'noindex, nofollow' : 'index, follow',
        },
        {
          property: 'og:type',
          content: 'profile',
        },
        {
          property: 'og:title',
          content: seoTitle,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:image',
          content: ogImage,
        },
        {
          property: 'og:url',
          content: profileUrl,
        },
        {
          property: 'og:site_name',
          content: `${siteAssociation} Members`,
        },
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          name: 'twitter:title',
          content: seoTitle,
        },
        {
          name: 'twitter:description',
          content: description,
        },
        {
          name: 'twitter:image',
          content: ogImage,
        },
        {
          name: 'geo.region',
          content: data.state || '',
        },
        {
          name: 'geo.placename',
          content: data.city || '',
        },
      ].filter(tag => tag.content && tag.content.trim() !== '')
    );
  }

  function generateSEOTitle({ fullName, areasOfPractices, siteAssociation }) {
    return `${fullName}${
      areasOfPractices && areasOfPractices.length > 0
        ? ` | ${areasOfPractices.slice(0, 3).join(', ')}`
        : ''
    } | ${siteAssociation} Member`;
  }

  function stripHtmlTags(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = {
  publicProfileOnReady,
};
