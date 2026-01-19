const { getMainAddress } = require('../../public/Utils/sharedUtils');
const { getMemberBySlug } = require('../members-data-methods');
const {
  getMoreAddressesToDisplay,
  formatDateToMonthYear,
  hasStudentMembership,
  isPAC_STAFF,
} = require('../utils');

function generateSEOTitle({ fullName, areasOfPractices, siteAssociation }) {
  return `${fullName}${
    areasOfPractices && areasOfPractices.length > 0
      ? ` | ${areasOfPractices.slice(0, 3).join(', ')}`
      : ''
  } | ${siteAssociation} Member`;
}

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

function shouldHaveStudentBadge(member, siteAssociation) {
  return hasStudentMembership({
    member,
    checkAssociation: true,
    siteAssociation,
  });
}

function transformMemberToProfileData(member, siteAssociation) {
  if (!member) {
    throw new Error('member is required');
  }
  const addresses = member.addresses || [];
  const mainAddress = getMainAddress(member.addressDisplayOption, addresses);
  const licenceNo = member.licenses
    ?.map(val => val.license)
    .filter(Boolean)
    .join(', ');
  const moreAddressesToDisplay = getMoreAddressesToDisplay(
    member.addresses,
    member.addressDisplayOption
  );

  const memberships = member.memberships || [];
  const siteAssociationMembership = memberships.find(m => m.association === siteAssociation);

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
  return {
    mainAddress,
    testimonials: member.testimonial || [],
    licenceNo,
    moreAddressesToDisplay,
    memberSince:
      (member.showABMP &&
        siteAssociationMembership &&
        formatDateToMonthYear(siteAssociationMembership?.membersince)) ||
      '',
    shouldHaveStudentBadge: shouldHaveStudentBadge(member, siteAssociation),
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
    isPrivateMember: isPAC_STAFF(member),
  };
}

const getMemberProfileData = async (slug, siteAssociation) => {
  try {
    const member = await getMemberBySlug({
      slug,
      excludeDropped: true,
      excludeSearchedMember: false,
    });

    if (!member) {
      console.log(`[getMemberProfileData] Member not found for slug: ${slug}`);
      return null;
    }

    return transformMemberToProfileData(member, siteAssociation);
  } catch (error) {
    const errorMessage = `Error in getMemberProfileData for slug: ${slug} : ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};

module.exports = {
  generateSEOTitle,
  stripHtmlTags,
  getMemberProfileData,
};
