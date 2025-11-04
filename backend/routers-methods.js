const {
  DEFAULT_SEO_DESCRIPTION,
  ADDRESS_STATUS_TYPES,
  ABMP_LOGO_URL,
  SITE_ASSOCIATION,
  MEMBERSHIPS_TYPES,
  formatAddress,
  getMainAddress,
  generateId,
} = require('../public');

const { getMemberBySlug } = require('./members-data-methods');
const { formatDateToMonthYear } = require('./utils');

/**
 * Generates SEO title for member profile
 * @param {string} fullName - Member's full name
 * @param {Array<string>} areasOfPractices - Member's areas of practice
 * @returns {string} SEO title
 */
function generateSEOTitle(fullName, areasOfPractices) {
  return `${fullName}${
    areasOfPractices && areasOfPractices.length > 0
      ? ` | ${areasOfPractices.slice(0, 3).join(', ')}`
      : ''
  } | ABMP Member`;
}

/**
 * Strips HTML tags and decodes HTML entities from a string
 * @param {string} html - HTML string to clean
 * @returns {string} Cleaned text
 */
function stripHtmlTags(html) {
  if (!html) return '';
  // Remove HTML tags and decode HTML entities
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
    .replace(/&amp;/g, '&') // Replace encoded ampersands
    .replace(/&lt;/g, '<') // Replace encoded less than
    .replace(/&gt;/g, '>') // Replace encoded greater than
    .replace(/&quot;/g, '"') // Replace encoded quotes
    .replace(/&#39;/g, "'") // Replace encoded apostrophes
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .trim(); // Remove leading/trailing whitespace
}

/**
 * Check if member has student membership
 * @param {Object} member - Member object
 * @param {boolean} checkAssociation - Whether to check for specific association
 * @returns {boolean} True if member has student membership
 */
function hasStudentMembership(member, checkAssociation) {
  const memberships = member?.memberships;
  if (!Array.isArray(memberships)) return false;

  return memberships.some(membership => {
    const isStudent = membership.membertype === MEMBERSHIPS_TYPES.STUDENT;
    const hasCorrectAssociation = !checkAssociation || membership.association === SITE_ASSOCIATION;
    return isStudent && hasCorrectAssociation;
  });
}

/**
 * Check if member should have student badge
 * @param {Object} member - Member object
 * @returns {boolean} True if should have badge
 */
function shouldHaveStudentBadge(member) {
  return hasStudentMembership(member, true);
}

/**
 * Get addresses by status, excluding main address
 * @param {Array} addresses - All addresses
 * @param {Array} addressDisplayOption - Display options
 * @returns {Array} Processed addresses
 */
function getAddressesByStatus(addresses = [], addressDisplayOption = []) {
  const visible = addresses.filter(addr => addr.addressStatus !== ADDRESS_STATUS_TYPES.DONT_SHOW);
  if (visible.length < 2) {
    return [];
  }
  const opts = Array.isArray(addressDisplayOption) ? addressDisplayOption : [];
  const mainOpt = opts.find(o => o.isMain);
  const mainKey = mainOpt ? mainOpt.key : visible[0].key;
  return visible
    .filter(addr => addr?.key !== mainKey)
    .map(addr => {
      const addressString = formatAddress(addr);
      return addressString ? { _id: generateId(), address: addressString } : null;
    })
    .filter(Boolean);
}

/**
 * Get member profile data formatted for display
 * @param {Object} member - Member object
 * @returns {Object} Formatted profile data
 */
function getMemberProfileData(member) {
  if (!member) {
    throw new Error('member is required');
  }

  const addresses = member.addresses || [];
  const licenceNo = member.licenses
    ?.map(val => val.license)
    .filter(Boolean)
    .join(', ');
  const processedAddresses = getAddressesByStatus(member.addresses, member.addressDisplayOption);

  const memberships = member.memberships || [];
  const abmp = memberships.find(m => m.association === SITE_ASSOCIATION);

  const areasOfPractices =
    member.areasOfPractices
      ?.filter(item => typeof item === 'string' && item.trim().length > 0)
      .map(item => item.trim())
      .sort((a, b) =>
        a.localeCompare(b, undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      ) || [];

  const mainAddress = getMainAddress(member.addressDisplayOption, addresses);

  return {
    mainAddress: mainAddress,
    testimonials: member.testimonial || [],
    licenceNo,
    processedAddresses,
    memberSince: (member.showABMP && abmp && formatDateToMonthYear(abmp?.membersince)) || '',
    shouldHaveStudentBadge: shouldHaveStudentBadge(member),
    logoImage: member.logoImage,
    fullName: member.fullName,
    profileImage: member.profileImage,
    showContactForm: member.showContactForm,
    bookingUrl: member.bookingUrl,
    aboutService: member.aboutService,
    businessName: (member.showBusinessName && member.businessName) || '',
    phone: member.toShowPhone || '',
    areasOfPractices,
    gallery: member.gallery,
    bannerImages: member.bannerImages,
    showWixUrl: member.showWixUrl,
    _id: member._id,
    url: member.url,
    city: mainAddress?.city || '',
    state: mainAddress?.state || '',
    isPrivateMember: member.memberships.some(
      membership => membership.membertype === MEMBERSHIPS_TYPES.PAC_STAFF
    ),
  };
}

/**
 * Profile router handler
 * @param {Object} request - Router request object
 * @param {Object} dependencies - Dependencies (ok, notFound, redirect, sendStatus)
 * @returns {Promise} Router response
 */
async function profileRouter(request, dependencies) {
  const { ok, notFound, redirect, sendStatus } = dependencies;

  const slug = request.path[0];
  if (!slug) {
    return redirect(request.baseUrl);
  }
  try {
    const member = await getMemberBySlug({
      slug,
      excludeDropped: true,
      excludeSearchedMember: false,
    });

    if (!member) {
      return notFound();
    }

    const profileData = getMemberProfileData(member);

    if (profileData && profileData.showWixUrl) {
      const ogImage = profileData.profileImage || profileData.logoImage || ABMP_LOGO_URL;
      const seoTitle = generateSEOTitle(profileData.fullName, profileData.areasOfPractices);
      // Use stripped HTML from aboutService rich text content
      let description = stripHtmlTags(profileData.aboutService) || DEFAULT_SEO_DESCRIPTION;

      // Limit description to 160 characters for optimal SEO
      if (description.length > 160) {
        description = description.substring(0, 157) + '...';
      }
      const profileUrl = `https://www.abmpmembers.com/profile/${profileData.url}`;
      const isPrivateMember = profileData.isPrivateMember;
      const seoData = {
        title: seoTitle,
        description: description,
        noIndex: isPrivateMember,
        metaTags: [
          {
            name: 'description',
            content: description,
          },
          {
            name: 'keywords',
            content:
              `${profileData.fullName}, ${profileData.areasOfPractices ? profileData.areasOfPractices.slice(0, 3).join(', ') : ''}, ABMP, ${profileData.city || ''}, ${profileData.state || ''}`
                .replace(/,\s*,/g, ',')
                .replace(/^,|,$/g, ''),
          },
          {
            name: 'author',
            content: profileData.fullName,
          },
          {
            name: 'robots',
            content: isPrivateMember ? 'noindex, nofollow' : 'index, follow',
          },
          // Open Graph tags
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
            content: 'ABMP Members',
          },
          // Twitter Card tags
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
          // Additional SEO tags
          {
            name: 'geo.region',
            content: profileData.state || '',
          },
          {
            name: 'geo.placename',
            content: profileData.city || '',
          },
        ].filter(tag => tag.content && tag.content.trim() !== ''), // Remove empty tags
      };
      return ok('profile', profileData, seoData);
    }
    return notFound();
  } catch (error) {
    console.error(error);
    return sendStatus('500', 'Internal Server Error');
  }
}

/**
 * Profile sitemap generator
 * @param {Object} _sitemapRequest - Sitemap request object
 * @param {Object} _dependencies - Dependencies (WixRouterSitemapEntry)
 * @param {Function} _fetchAllItemsInParallel - Function to fetch all items in parallel
 * @returns {Array} Sitemap entries
 */
function profileSiteMap(_sitemapRequest, _dependencies, _fetchAllItemsInParallel) {
  return [];
  // Commented out - currently disabled in host site
  /*
  const { WixRouterSitemapEntry, wixData } = dependencies;
  
  try {
    const membersQuery = wixData
      .query(COLLECTIONS.MEMBERS_DATA)
      .eq('showWixUrl', true)
      .isNotEmpty('url')
      .ne('action', 'drop')
      .fields('url', 'fullName');

    const allMembers = await fetchAllItemsInParallel(membersQuery);

    const batchSize = 1000;
    const sitemapEntries = [];
    const totalItems = allMembers.items.length;

    for (let i = 0; i < totalItems; i += batchSize) {
      const batch = allMembers.items.slice(i, i + batchSize);
      const batchEntries = batch.map(member => {
        const entry = new WixRouterSitemapEntry(member.fullName);
        entry.pageName = 'profile';
        entry.url = `profile/${member.url}`;
        entry.title = member.fullName;
        entry.changeFrequency = 'monthly';
        entry.priority = 1.0;
        return entry;
      });
      sitemapEntries.push(...batchEntries);
    }

    return sitemapEntries;
  } catch (error) {
    console.error('Error generating profile sitemap:', error);
    return [];
  }
  */
}

module.exports = {
  profileRouter,
  profileSiteMap,
  getMemberProfileData,
  generateSEOTitle,
  stripHtmlTags,
};
