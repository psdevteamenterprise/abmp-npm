const { ADDRESS_STATUS_TYPES, SITE_ASSOCIATION, MEMBERSHIPS_TYPES } = require('../public');
const { formatAddress, generateId, getMainAddress } = require('../public/Utils/sharedUtils');

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

module.exports = {
  generateSEOTitle,
  stripHtmlTags,
  hasStudentMembership,
  shouldHaveStudentBadge,
  getAddressesByStatus,
  getMemberProfileData,
};
