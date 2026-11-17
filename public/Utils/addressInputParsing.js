/**
 * Helpers for turning what the member picked or typed in the address picker
 * (the Wix AddressInput, backed by Google Places) into our stored address.
 *
 * Why this exists: the structured value Google returns is a poor fit for some
 * US addresses. Townships and unincorporated places have no "city", so the
 * picker falls back to the county ("Butler County" for Cranberry Township),
 * and neighbourhoods are folded into the parent city ("Los Angeles" for
 * Granada Hills). The suggestion text the member actually clicked on does
 * carry the right locality, so we read it from there. Suggestions never carry
 * a suite number either, so when the member adds one after picking a
 * suggestion we keep it instead of throwing the whole value away.
 */

const SUITE_KEYWORDS = [
  'bldg',
  'building',
  'ste',
  'suite',
  'apt',
  'unit',
  'studio',
  'floor',
  'rm',
  'room',
  '#',
];
const MAX_SUITE_LENGTH = 40;

const splitFormatted = formatted =>
  String(formatted || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stateZipPattern = subdivision =>
  new RegExp(
    `^${subdivision ? escapeRegExp(subdivision) : '[A-Z]{2}'}(\\s+\\d{5}(-\\d{4})?)?$`,
    'i'
  );

const looksLikeSuite = part => {
  const lower = String(part || '').toLowerCase();
  return SUITE_KEYWORDS.some(keyword => lower.includes(keyword));
};

const normalizeLocality = locality =>
  String(locality || '')
    .replace(/\bTwp\.?$/i, 'Township')
    .trim();

/**
 * The locality as it appears in the suggestion text: the part right before
 * the "ST 12345" part. Empty when the text does not have that shape.
 */
function localityFromFormatted(formatted, subdivision) {
  const parts = splitFormatted(formatted);
  const stateIndex = parts.findIndex(
    (part, index) => index > 0 && stateZipPattern(subdivision).test(part)
  );
  if (stateIndex < 2) return '';
  const locality = parts[stateIndex - 1];
  if (looksLikeSuite(locality)) return '';
  return normalizeLocality(locality);
}

/**
 * Prefer the locality the member saw in the suggestion over Google's
 * structured city, which may be a county or a parent city.
 */
function resolveCity({ city, formatted, subdivision } = {}) {
  const locality = localityFromFormatted(formatted, subdivision);
  return locality || city || '';
}

/** Building / suite / apartment info spelled out in the suggestion text, if any. */
function suiteFromFormatted(formatted) {
  const parts = splitFormatted(formatted);
  return parts.slice(1).find(looksLikeSuite) || '';
}

const hasStructure = value => Boolean(value && value.streetAddress);

/**
 * When the member picks a suggestion and then types a suite after it, the
 * picker hands us free text with no structure. Recover the structured value of
 * the last suggestion picked and treat whatever the member added as the suite.
 * Returns null when the typed text is not that suggestion plus an addition.
 */
function mergeTypedSuite(typedValue, pickedValue) {
  if (!typedValue || hasStructure(typedValue) || !typedValue.formatted) return null;
  if (!hasStructure(pickedValue) || !pickedValue.formatted) return null;

  const pickedParts = splitFormatted(pickedValue.formatted);
  const streetPart = pickedParts[0];
  if (!streetPart) return null;

  let remaining = String(typedValue.formatted);
  let found = 0;
  pickedParts.forEach(part => {
    const match = new RegExp(escapeRegExp(part), 'i').exec(remaining);
    if (!match) return;
    found += 1;
    remaining = remaining.slice(0, match.index) + ' ' + remaining.slice(match.index + part.length);
  });

  // The street must still be there, otherwise the member typed a different address.
  if (found === 0 || !new RegExp(escapeRegExp(streetPart), 'i').test(typedValue.formatted))
    return null;

  const suite = remaining
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();

  if (!suite || suite.length > MAX_SUITE_LENGTH || !/[A-Za-z#]/.test(suite)) return null;

  return {
    ...pickedValue,
    formatted: typedValue.formatted,
    streetAddress: { ...pickedValue.streetAddress, apt: suite },
  };
}

module.exports = {
  localityFromFormatted,
  mergeTypedSuite,
  resolveCity,
  suiteFromFormatted,
};
