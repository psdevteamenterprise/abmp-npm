const { isNotValidUrl } = require('../../public/Utils/personalDetailsUtils');

// ─── Helpers ─────────────────────────────────────────────────────────

const isValid = url => !isNotValidUrl(url);

// ─── Regression: digits in the hostname ──────────────────────────────
// Monday bug 12663709539 - a member could not save the booking link
// https://patty-10439.square.site because the host character class was
// written `[da-z.-]` instead of `[\da-z.-]`, rejecting every domain
// containing a digit.

describe('isNotValidUrl - digits in hostname', () => {
  it('accepts the exact URL from the bug report', () => {
    expect(isValid('https://patty-10439.square.site')).toBe(true);
  });

  it.each([
    'https://my-spa123.com',
    'https://massage4u.net',
    'https://booksy.com/en-us/698924_therapist_health-fitness_119607_city',
    'https://www.genbook.com/bookings/slot/reservation/30241562?bookingSourceId=1000',
    'www.spa2go.com',
    'https://123.example.com',
  ])('accepts %s', url => {
    expect(isValid(url)).toBe(true);
  });
});

describe('isNotValidUrl - case insensitivity', () => {
  it.each(['https://Patty-10439.Square.Site', 'HTTPS://EXAMPLE.COM', 'WWW.Example.Com'])(
    'accepts %s',
    url => {
      expect(isValid(url)).toBe(true);
    }
  );
});

// ─── Guard against regressions in the previously-working cases ───────

describe('isNotValidUrl - previously valid URLs stay valid', () => {
  it.each([
    'https://square.site',
    'https://patty.square.site',
    'http://healinghut.massagetherapy.com',
    'www.example.com',
    'https://example.co.uk',
    'https://example.com/path/to/page',
    'https://example.com?foo=bar',
    'https://example.com#anchor',
  ])('accepts %s', url => {
    expect(isValid(url)).toBe(true);
  });
});

describe('isNotValidUrl - invalid input is still rejected', () => {
  it.each(['not a url', 'example', 'ftp://example.com', 'justtext.c', 'http://'])(
    'rejects %s',
    url => {
      expect(isValid(url)).toBe(false);
    }
  );

  it('treats an empty value as valid because the field is optional', () => {
    expect(isValid('')).toBe(true);
    expect(isValid(undefined)).toBe(true);
    expect(isValid(null)).toBe(true);
  });
});
