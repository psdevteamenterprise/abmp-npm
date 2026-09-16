const {
  getCurrentYear,
  withCurrentCopyrightYear,
  hasCopyrightYear,
} = require('../../public/Utils/copyrightYear');

describe('withCurrentCopyrightYear', () => {
  const in2026 = new Date('2026-09-16T12:00:00Z');

  test('the ABMP footer left on 2025 becomes the current year', () => {
    expect(withCurrentCopyrightYear('© 2025 ', in2026)).toBe('© 2026 ');
  });

  test('a footer already on the current year is unchanged', () => {
    expect(withCurrentCopyrightYear('© 2026 ', in2026)).toBe('© 2026 ');
  });

  test('rolls over on 1 January in Denver, not in UTC', () => {
    // 03:00 UTC on 1 Jan is still 31 Dec in Denver.
    expect(withCurrentCopyrightYear('© 2026', new Date('2027-01-01T03:00:00Z'))).toBe('© 2026');
    expect(withCurrentCopyrightYear('© 2026', new Date('2027-01-01T08:00:00Z'))).toBe('© 2027');
  });

  test('keeps the rest of the notice and only touches the year after the mark', () => {
    expect(
      withCurrentCopyrightYear('© 2025 Jane Doe. All rights reserved. Est. 1999', in2026)
    ).toBe('© 2026 Jane Doe. All rights reserved. Est. 1999');
    expect(withCurrentCopyrightYear('Copyright 2025 PAC', in2026)).toBe('Copyright 2026 PAC');
    // What a Wix text element's .html looks like
    expect(
      withCurrentCopyrightYear('<p class="font_8"><span>&copy; 2025 </span></p>', in2026)
    ).toBe('<p class="font_8"><span>&copy; 2026 </span></p>');
  });

  test('text without a copyright year is left alone, including non-strings', () => {
    expect(withCurrentCopyrightYear('All rights reserved.', in2026)).toBe('All rights reserved.');
    expect(withCurrentCopyrightYear('Member since 2025', in2026)).toBe('Member since 2025');
    expect(withCurrentCopyrightYear(undefined, in2026)).toBeUndefined();
  });

  test('hasCopyrightYear identifies the footer element by content', () => {
    expect(hasCopyrightYear('© 2025 ')).toBe(true);
    expect(hasCopyrightYear('Member since 2025')).toBe(false);
    expect(hasCopyrightYear(null)).toBe(false);
  });

  test('getCurrentYear reads the year in Denver', () => {
    expect(getCurrentYear(new Date('2026-12-31T23:30:00-07:00'))).toBe(2026);
    expect(getCurrentYear(new Date('2027-01-01T00:30:00-07:00'))).toBe(2027);
  });
});
