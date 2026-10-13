// The member website footer reads "© <year> <member name>. All rights reserved." The year was typed
// into each site's editor, so ABMP stayed on 2025 while ASCP and AHP said 2026 (PAC ticket
// 12914830766). This keeps the year current without anyone touching the editors again.
// Deliberately free of Wix imports so it can be unit-tested.

const ASSOCIATION_TIME_ZONE = 'America/Denver';
// Matches the year in "© 2025", "&copy; 2025" (the .html of a text element), "(c) 2025" and
// "Copyright 2025", and nothing else — "Member since 2025" is left alone.
const COPYRIGHT_YEAR_PATTERN = /(©|&copy;|\(c\)|copyright)(\s*|&nbsp;)(\d{4})/i;

// PAC operates in Denver; the year should roll over at their midnight, not the visitor's.
const getCurrentYear = (now = new Date()) => {
  try {
    return Number(
      new Intl.DateTimeFormat('en-US', { timeZone: ASSOCIATION_TIME_ZONE, year: 'numeric' }).format(
        now
      )
    );
  } catch {
    return now.getUTCFullYear();
  }
};

/** Returns the text with the year after the copyright mark set to the current year, or unchanged. */
const withCurrentCopyrightYear = (text, now = new Date()) => {
  if (typeof text !== 'string') return text;
  return text.replace(
    COPYRIGHT_YEAR_PATTERN,
    (_, mark, space) => `${mark}${space}${getCurrentYear(now)}`
  );
};

const hasCopyrightYear = text => typeof text === 'string' && COPYRIGHT_YEAR_PATTERN.test(text);

module.exports = { getCurrentYear, withCurrentCopyrightYear, hasCopyrightYear };
