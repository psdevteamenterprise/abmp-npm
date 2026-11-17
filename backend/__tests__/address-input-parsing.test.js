const {
  localityFromFormatted,
  mergeTypedSuite,
  resolveCity,
  suiteFromFormatted,
} = require('../../public/Utils/addressInputParsing');

describe('resolveCity', () => {
  test('a township with no Google city keeps the township from the suggestion text', () => {
    expect(
      resolveCity({
        city: 'Butler County',
        formatted: '2045 Mackenzie Way, Cranberry Township, PA 16066, USA',
        subdivision: 'PA',
      })
    ).toBe('Cranberry Township');
  });

  test('expands the Twp abbreviation Google sometimes uses', () => {
    expect(
      resolveCity({
        city: 'Butler County',
        formatted: '2045 Mackenzie Way, Cranberry Twp, PA 16066, USA',
        subdivision: 'PA',
      })
    ).toBe('Cranberry Township');
  });

  test('a neighbourhood wins over the parent city Google reports', () => {
    expect(
      resolveCity({
        city: 'Los Angeles',
        formatted: '17539 Chatsworth Street, Granada Hills, CA 91344, USA',
        subdivision: 'CA',
      })
    ).toBe('Granada Hills');
  });

  test('a suggestion without a ZIP still yields the locality', () => {
    expect(
      resolveCity({
        city: 'Los Angeles',
        formatted: '17539 Chatsworth Street, Granada Hills, CA, USA',
        subdivision: 'CA',
      })
    ).toBe('Granada Hills');
  });

  test('an ordinary city is unchanged', () => {
    expect(
      resolveCity({
        city: 'Verona',
        formatted: '25 Pompton Avenue, Verona, NJ 07044, USA',
        subdivision: 'NJ',
      })
    ).toBe('Verona');
  });

  test('falls back to the structured city when the text has no state part', () => {
    expect(resolveCity({ city: 'Verona', formatted: '25 Pompton Avenue', subdivision: 'NJ' })).toBe(
      'Verona'
    );
    expect(resolveCity({ city: 'Verona', formatted: '', subdivision: 'NJ' })).toBe('Verona');
    expect(resolveCity({})).toBe('');
  });

  test('never mistakes a suite part for the locality', () => {
    expect(localityFromFormatted('25 Pompton Avenue, Ste 304C, NJ 07044, USA', 'NJ')).toBe('');
    expect(
      resolveCity({
        city: 'Verona',
        formatted: '25 Pompton Avenue, Ste 304C, NJ 07044, USA',
        subdivision: 'NJ',
      })
    ).toBe('Verona');
  });
});

describe('suiteFromFormatted', () => {
  test('finds a suite, studio or unit spelled out in the suggestion text', () => {
    expect(suiteFromFormatted('25 Pompton Avenue, Ste 304C, Verona, NJ 07044, USA')).toBe(
      'Ste 304C'
    );
    expect(suiteFromFormatted('2045 Mackenzie Way, Studio 16a, Cranberry Township, PA 16066')).toBe(
      'Studio 16a'
    );
  });

  test('ignores the street part and plain localities', () => {
    expect(suiteFromFormatted('100 Unit Street, Verona, NJ 07044, USA')).toBe('');
    expect(suiteFromFormatted('17539 Chatsworth Street, Granada Hills, CA 91344, USA')).toBe('');
  });
});

describe('mergeTypedSuite', () => {
  const picked = {
    formatted: '25 Pompton Avenue, Verona, NJ 07044, USA',
    location: { latitude: 40.826, longitude: -74.2297 },
    streetAddress: { name: 'Pompton Avenue', number: '25', apt: '' },
    city: 'Verona',
    subdivision: 'NJ',
    country: 'US',
    postalCode: '07044',
  };

  test('a suite typed after the picked suggestion is kept with the structured value', () => {
    const merged = mergeTypedSuite(
      { formatted: '25 Pompton Avenue, Verona, NJ 07044, USA Ste 304C' },
      picked
    );
    expect(merged).toMatchObject({
      city: 'Verona',
      subdivision: 'NJ',
      postalCode: '07044',
      location: picked.location,
      streetAddress: { name: 'Pompton Avenue', number: '25', apt: 'Ste 304C' },
    });
  });

  test('a suite typed right after the street works too', () => {
    const merged = mergeTypedSuite(
      { formatted: '25 Pompton Avenue Ste 304C, Verona, NJ 07044, USA' },
      picked
    );
    expect(merged.streetAddress.apt).toBe('Ste 304C');
  });

  test('replacing an earlier suite keeps only the new one', () => {
    const withSuite = {
      ...picked,
      formatted: '25 Pompton Avenue, Ste 304C, Verona, NJ 07044',
      streetAddress: { ...picked.streetAddress, apt: 'Ste 304C' },
    };
    const merged = mergeTypedSuite(
      { formatted: '25 Pompton Avenue, Ste 305, Verona, NJ 07044' },
      withSuite
    );
    expect(merged.streetAddress.apt).toBe('Ste 305');
  });

  test('is null when the member typed a different address', () => {
    expect(mergeTypedSuite({ formatted: '9 Other Road, Verona, NJ 07044' }, picked)).toBeNull();
  });

  test('is null when nothing was added, the value is structured, or nothing was picked', () => {
    expect(
      mergeTypedSuite({ formatted: '25 Pompton Avenue, Verona, NJ 07044, USA' }, picked)
    ).toBeNull();
    expect(mergeTypedSuite(picked, picked)).toBeNull();
    expect(
      mergeTypedSuite({ formatted: '25 Pompton Avenue, Verona, NJ 07044, USA Ste 1' }, null)
    ).toBeNull();
    expect(mergeTypedSuite(null, picked)).toBeNull();
  });

  test('is null when the addition is only digits, such as a ZIP+4', () => {
    expect(
      mergeTypedSuite({ formatted: '25 Pompton Avenue, Verona, NJ 07044-2941, USA' }, picked)
    ).toBeNull();
  });
});
