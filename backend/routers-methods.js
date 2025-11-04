const { DEFAULT_SEO_DESCRIPTION, ABMP_LOGO_URL } = require('../public');

const { getMemberBySlug } = require('./members-data-methods');
const { generateSEOTitle, stripHtmlTags, getMemberProfileData } = require('./routers-utils');

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
  // Re-export utilities for backward compatibility
  getMemberProfileData,
  generateSEOTitle,
  stripHtmlTags,
};
