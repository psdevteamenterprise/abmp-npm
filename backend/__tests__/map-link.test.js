const { ADDRESS_STATUS_TYPES } = require('../../public/consts');
const { buildMapLink, buildDirectionsLink } = require('../../public/Utils/sharedUtils');

// ─── Helpers ─────────────────────────────────────────────────────────

const fullAddress = (overrides = {}) => ({
  line1: '1366 4th Ave',
  line2: '',
  city: 'Coraopolis',
  state: 'PA',
  postalcode: '15108-1675',
  latitude: 40.4129180908203,
  longitude: -80.0293197631836,
  addressStatus: ADDRESS_STATUS_TYPES.FULL_ADDRESS,
  ...overrides,
});

const queryOf = url => decodeURIComponent((url.split('?q=')[1] || '').replace(/\+/g, ' '));

// ─── Monday 12596102059 ──────────────────────────────────────────────
// NetForum's address verifier returned coordinates ~10.8 miles from the real
// address for member 1806273. The directions link should resolve from the
// address text, which is correct, rather than from the coordinates.

describe('buildMapLink - prefers the address over coordinates', () => {
  it('builds the link from the street address, not the lat/long', () => {
    const url = buildMapLink(fullAddress());

    expect(url).toContain('maps.google.com');
    expect(queryOf(url)).toBe('1366 4th Ave, Coraopolis, PA, 15108');
  });

  it('does not put the stored coordinates in the link when an address exists', () => {
    const url = buildMapLink(fullAddress());

    expect(url).not.toContain('40.4129');
    expect(url).not.toContain('-80.0293');
  });

  it('still resolves correctly when the coordinates are wrong', () => {
    // Coordinates deliberately far from the address - the link must ignore them.
    const url = buildMapLink(fullAddress({ latitude: 0, longitude: 0 }));

    expect(queryOf(url)).toBe('1366 4th Ave, Coraopolis, PA, 15108');
  });

  it('url-encodes the address so spaces do not break the link', () => {
    const url = buildMapLink(fullAddress());

    expect(url).not.toMatch(/\?q=.*\s/);
  });
});

// ─── Privacy ─────────────────────────────────────────────────────────
// formatAddress omits line1 for anything other than full_address. Callers gate
// on full_address before showing the button, but the helper must not leak a
// hidden street address even if it is called directly.

describe('buildMapLink - does not leak a hidden street address', () => {
  it('omits the street line for a state_city_zip address', () => {
    const url = buildMapLink(fullAddress({ addressStatus: ADDRESS_STATUS_TYPES.STATE_CITY_ZIP }));

    expect(url).not.toContain('4th');
    expect(queryOf(url)).toBe('Coraopolis, PA, 15108');
  });

  it('builds no link at all for dont_show, not even from coordinates', () => {
    // Previously this fell through to the coordinate fallback, which would have
    // put the member's exact position in an outbound maps URL - worse than the
    // street line they chose to hide.
    const url = buildMapLink(fullAddress({ addressStatus: ADDRESS_STATUS_TYPES.DONT_SHOW }));

    expect(url).toBe('');
  });

  it('truncates the postal code to five digits', () => {
    const url = buildMapLink(fullAddress());

    expect(url).not.toContain('1675');
  });
});

// ─── Fallbacks ───────────────────────────────────────────────────────

describe('buildMapLink - fallbacks', () => {
  it('uses coordinates when the address has no printable parts', () => {
    const url = buildMapLink({
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalcode: '',
      latitude: 40.5,
      longitude: -80.1,
      addressStatus: ADDRESS_STATUS_TYPES.FULL_ADDRESS,
    });

    expect(url).toBe('https://maps.google.com/?q=40.5,-80.1');
  });

  it('returns an empty string when there is neither an address nor coordinates', () => {
    expect(
      buildMapLink({
        line1: '',
        city: '',
        state: '',
        postalcode: '',
        addressStatus: ADDRESS_STATUS_TYPES.FULL_ADDRESS,
      })
    ).toBe('');
  });

  it('returns an empty string for a missing address', () => {
    expect(buildMapLink(null)).toBe('');
    expect(buildMapLink(undefined)).toBe('');
  });
});

// ─── Monday 12596102059, third pass ──────────────────────────────────
// The second pass showed the directions button to city/state/ZIP members too. PAC
// rejected that: Richard confirmed the button must appear only for members who
// selected "Show Full Address". It also confirmed the other half - a full-address
// member no longer needs coordinates, because the link is built from address text.
// The rule flip-flopped twice untested, hence this block.

const displayOption = (key, isMain) => ({ key, isMain });

describe('buildDirectionsLink - only members showing a full address get a button', () => {
  it('returns a link for a full_address member', () => {
    const url = buildDirectionsLink([], [fullAddress({ key: 'a' })]);

    expect(queryOf(url)).toBe('1366 4th Ave, Coraopolis, PA, 15108');
  });

  it('returns no link for a state_city_zip member', () => {
    const link = buildDirectionsLink(
      [],
      [fullAddress({ key: 'a', addressStatus: ADDRESS_STATUS_TYPES.STATE_CITY_ZIP })]
    );

    expect(link).toBe('');
  });

  it('returns no link for a dont_show member', () => {
    const link = buildDirectionsLink(
      [],
      [fullAddress({ key: 'a', addressStatus: ADDRESS_STATUS_TYPES.DONT_SHOW })]
    );

    expect(link).toBe('');
  });

  it('returns no link for a legacy address with no addressStatus', () => {
    const link = buildDirectionsLink([], [fullAddress({ key: 'a', addressStatus: undefined })]);

    expect(link).toBe('');
  });

  it('returns no link when the member has no addresses at all', () => {
    expect(buildDirectionsLink([], [])).toBe('');
    expect(buildDirectionsLink()).toBe('');
  });
});

describe('buildDirectionsLink - coordinates are not required', () => {
  it('still builds a link when the coordinates are missing', () => {
    const url = buildDirectionsLink(
      [],
      [fullAddress({ key: 'a', latitude: undefined, longitude: undefined })]
    );

    expect(queryOf(url)).toBe('1366 4th Ave, Coraopolis, PA, 15108');
  });

  it('still builds a link when the coordinates are zero', () => {
    const url = buildDirectionsLink([], [fullAddress({ key: 'a', latitude: 0, longitude: 0 })]);

    expect(queryOf(url)).toBe('1366 4th Ave, Coraopolis, PA, 15108');
    expect(url).not.toContain('0,0');
  });

  it('ignores coordinates that are miles from the real address', () => {
    const url = buildDirectionsLink(
      [],
      [fullAddress({ key: 'a', latitude: 40.5628, longitude: -79.8853 })]
    );

    expect(url).not.toContain('40.5628');
    expect(queryOf(url)).toBe('1366 4th Ave, Coraopolis, PA, 15108');
  });
});

describe('buildDirectionsLink - follows the address that is actually displayed', () => {
  it('uses the main address rather than the first one on the record', () => {
    const url = buildDirectionsLink(
      [displayOption('b', true)],
      [
        fullAddress({ key: 'a', line1: '1 Wrong St' }),
        fullAddress({ key: 'b', line1: '2 Right Ave' }),
      ]
    );

    expect(queryOf(url)).toContain('2 Right Ave');
  });

  it('shows no button when the displayed address is city-level, even if a fuller one exists', () => {
    // The button sits next to the location text. Linking to a street address the
    // member is not displaying would point somewhere other than what is on screen.
    const link = buildDirectionsLink(
      [displayOption('b', true)],
      [
        fullAddress({ key: 'a' }),
        fullAddress({ key: 'b', addressStatus: ADDRESS_STATUS_TYPES.STATE_CITY_ZIP }),
      ]
    );

    expect(link).toBe('');
  });

  it('skips a hidden main address and uses the next visible full address', () => {
    // findMainAddress excludes dont_show, and the location text resolves the same
    // way, so the button and the text still agree.
    const url = buildDirectionsLink(
      [displayOption('a', true)],
      [
        fullAddress({ key: 'a', addressStatus: ADDRESS_STATUS_TYPES.DONT_SHOW }),
        fullAddress({ key: 'b', line1: '2 Right Ave' }),
      ]
    );

    expect(queryOf(url)).toContain('2 Right Ave');
  });

  it('never puts a hidden street address in the link', () => {
    const link = buildDirectionsLink(
      [displayOption('a', true)],
      [
        fullAddress({
          key: 'a',
          line1: '9 Secret Ln',
          addressStatus: ADDRESS_STATUS_TYPES.DONT_SHOW,
        }),
      ]
    );

    expect(link).toBe('');
  });
});
