// What makes a listing "updated", shared by the backfill and the search ordering so they cannot
// drift on the definition. Deliberately free of Wix imports.
//
// The flag is the durable answer: once a member saves their form it is set and stays set. The
// content check below is only how we approximate that for members who saved before the flag
// existed, which is why the backfill sets it true and never back to false.

const MEMBER_UPDATED_FIELD = 'memberUpdated';

// The five fields the PAC migration had no counterpart for, so content in any of them can only
// have been entered by the member. profileImage and businessName hold strings; gallery,
// bannerImages and testimonial hold arrays.
const MEMBER_ENTERED_FIELDS = [
  'profileImage',
  'gallery',
  'bannerImages',
  'testimonial',
  'businessName',
];

const hasContent = value => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return false;
};

const hasMemberEnteredContent = (member = {}) =>
  MEMBER_ENTERED_FIELDS.some(field => hasContent(member?.[field]));

const isMemberUpdated = member => member?.[MEMBER_UPDATED_FIELD] === true;

const memberNeedsUpdatedFlagBackfill = member =>
  hasMemberEnteredContent(member) && !isMemberUpdated(member);

/**
 * Counts for the dry run, over every member rather than only those needing a write, so a re-run
 * still reports the true tier split.
 * @param {Array} members
 * @returns {{total: number, tierOne: number, tierTwo: number, alreadyFlagged: number, needingBackfill: number}}
 */
const summarizeUpdatedOutcomes = (members = []) => {
  const summary = {
    total: members.length,
    tierOne: 0,
    tierTwo: 0,
    alreadyFlagged: 0,
    needingBackfill: 0,
  };
  members.forEach(member => {
    const flagged = isMemberUpdated(member);
    const willBeTierOne = flagged || hasMemberEnteredContent(member);
    willBeTierOne ? (summary.tierOne += 1) : (summary.tierTwo += 1);
    if (flagged) summary.alreadyFlagged += 1;
    if (memberNeedsUpdatedFlagBackfill(member)) summary.needingBackfill += 1;
  });
  return summary;
};

module.exports = {
  MEMBER_UPDATED_FIELD,
  MEMBER_ENTERED_FIELDS,
  hasMemberEnteredContent,
  isMemberUpdated,
  memberNeedsUpdatedFlagBackfill,
  summarizeUpdatedOutcomes,
};
