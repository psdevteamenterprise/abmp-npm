const { PAGES_PATHS } = require('../../public/consts');
const { isWixHostedImage } = require('../../public/Utils/sharedUtils');
//const { fetchAllItemsInParallel } = require('../cms-data-methods'); unused at host site
const { CONFIG_KEYS } = require('../consts');
const { getSiteConfigs } = require('../utils');

const { generateSEOTitle, stripHtmlTags, getMemberProfileData } = require('./utils');

const createRoutersHandlers = wixRouterMethods => {
  const {
    redirect,
    ok,
    notFound,
    sendStatus,
    WixRouterSitemapEntry: _WixRouterSitemapEntry,
  } = wixRouterMethods; // These dependencies needs to be injected as they do not have an SDK equivalent for now

  async function profileRouter(request) {
    const slug = request.path[0];
    if (!slug) {
      return redirect(request.baseUrl);
    }
    try {
      const siteConfigs = await getSiteConfigs();
      const siteAssociation = siteConfigs[CONFIG_KEYS.SITE_ASSOCIATION];
      const defaultSEODescription = siteConfigs[CONFIG_KEYS.DEFAULT_PROFILE_SEO_DESCRIPTION];
      const siteLogoUrl = siteConfigs[CONFIG_KEYS.SITE_LOGO_URL];
      const defaultProfileImage = siteConfigs[CONFIG_KEYS.DEFAULT_PROFILE_IMAGE];
      const profileData = await getMemberProfileData(slug, siteAssociation);
      if (profileData && profileData.showWixUrl) {
        const profileImage =
          profileData.profileImage?.trim() && isWixHostedImage(profileData.profileImage)
            ? profileData.profileImage
            : defaultProfileImage;
        const ogImage = profileImage || profileData.logoImage || siteLogoUrl;
        const seoTitle = generateSEOTitle({
          fullName: profileData.fullName,
          areasOfPractices: profileData.areasOfPractices,
          siteAssociation,
        });
        // Use stripped HTML from aboutService rich text content
        let description = stripHtmlTags(profileData.aboutService) || defaultSEODescription;

        // Limit description to 160 characters for optimal SEO
        if (description.length > 160) {
          description = description.substring(0, 157) + '...';
        }
        const profileUrl = `${request.baseUrl}/${PAGES_PATHS.PROFILE}/${profileData.url}`;
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
                `${profileData.fullName}, ${profileData.areasOfPractices ? profileData.areasOfPractices.slice(0, 3).join(', ') : ''}, ${siteAssociation}, ${profileData.city || ''}, ${profileData.state || ''}`
                  .replace(/,\s*,/g, ',')
                  .replace(/^,|,$/g, ''),
            },
            {
              name: 'author',
              content: profileData.fullName,
            },
            {
              name: 'robots',
              content:
                isPrivateMember || profileData?.optOut || profileData?.showWixUrl === false
                  ? 'noindex, nofollow'
                  : 'index, follow',
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
              content: `${siteAssociation} Members`,
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
        return ok('profile', { ...profileData, defaultProfileImage }, seoData);
      }
      console.log(
        `[profileRouter] Profile not found returning 404 for: ${JSON.stringify({
          slug,
          profileData,
          showWixUrl: profileData?.showWixUrl,
        })}`
      );
      return notFound();
    } catch (error) {
      console.error(`Error in profileRouter for slug: ${slug} : ${error.message}`);
      return sendStatus('500', 'Internal Server Error');
    }
  }
  function profileSiteMap(_sitemapRequest) {
    return [];
    // Commented out - currently disabled in host site
    //   try {
    //     const membersQuery = wixData
    //       .query(COLLECTIONS.MEMBERS_DATA)
    //       .eq('showWixUrl', true)
    //       .isNotEmpty('url')
    //       .ne('action', 'drop')
    //       .fields('url', 'fullName');

    //     const allMembers = await fetchAllItemsInParallel(membersQuery);

    //     const batchSize = 1000;
    //     const sitemapEntries = [];
    //     const totalItems = allMembers.items.length;

    //     for (let i = 0; i < totalItems; i += batchSize) {
    //       const batch = allMembers.items.slice(i, i + batchSize);
    //       const batchEntries = batch.map(member => {
    //         const entry = new WixRouterSitemapEntry(member.fullName);
    //         entry.pageName = 'profile';
    //         entry.url = `${PAGES_PATHS.PROFILE}/${member.url}`;
    //         entry.title = member.fullName;
    //         entry.changeFrequency = 'monthly';
    //         entry.priority = 1.0;
    //         return entry;
    //       });
    //       sitemapEntries.push(...batchEntries);
    //     }

    //     return sitemapEntries;
    //   } catch (error) {
    //     console.error('Error generating profile sitemap:', error);
    //     return [];
    //   }
  }
  //Add other routers here
  return {
    profileRouter,
    profileSiteMap,
    //Add other routers here
  };
};

module.exports = {
  createRoutersHandlers,
};
