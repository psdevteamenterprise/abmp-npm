const { COLLECTIONS } = require('../public/consts');

const { CONFIG_KEYS } = require('./consts');
const { MEMBER_ACTIONS } = require('./daily-pull/consts');
const { wixData } = require('./elevated-modules');
const { findMemberByWixDataId } = require('./members-data-methods');
const { transformMemberToProfileData } = require('./routers/utils');
const { getSiteConfigs } = require('./utils');

const getPublicMemberRecord = memberDataId =>
  wixData
    .query(COLLECTIONS.MEMBERS_DATA_PUBLIC)
    .eq('memberData', memberDataId)
    .limit(1)
    .find()
    .then(res => res.items?.[0] || null);

async function getPublicMemberProfileData({ memberDataId }) {
  if (!memberDataId) {
    return null;
  }

  const publicMember = await getPublicMemberRecord(memberDataId);
  if (!publicMember || publicMember.showWixUrl !== true) {
    return null;
  }

  const member = await findMemberByWixDataId(memberDataId);
  if (!member || member.action === MEMBER_ACTIONS.DROP || member.showWixUrl !== true) {
    return null;
  }

  const siteConfigs = await getSiteConfigs();
  const siteAssociation = siteConfigs[CONFIG_KEYS.SITE_ASSOCIATION];
  const defaultProfileImage = siteConfigs[CONFIG_KEYS.DEFAULT_PROFILE_IMAGE];

  const profileData = transformMemberToProfileData(member, siteAssociation);
  return {
    profileData: { ...profileData, defaultProfileImage },
  };
}

module.exports = {
  getPublicMemberProfileData,
  async getPublicProfileSeoConfig() {
    const siteConfigs = await getSiteConfigs();
    return {
      siteAssociation: siteConfigs[CONFIG_KEYS.SITE_ASSOCIATION],
      defaultSEODescription: siteConfigs[CONFIG_KEYS.DEFAULT_PROFILE_SEO_DESCRIPTION],
      siteLogoUrl: siteConfigs[CONFIG_KEYS.SITE_LOGO_URL],
      defaultProfileImage: siteConfigs[CONFIG_KEYS.DEFAULT_PROFILE_IMAGE],
    };
  },
};
