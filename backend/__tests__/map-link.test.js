const { ADDRESS_STATUS_TYPES } = require('../../public/consts');
const { buildMapLink } = require('../../public/Utils/sharedUtils');

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

  it('falls back to coordinates rather than the street line for dont_show', () => {
    const url = buildMapLink(fullAddress({ addressStatus: ADDRESS_STATUS_TYPES.DONT_SHOW }));

    expect(url).not.toContain('4th');
    expect(url).toBe('https://maps.google.com/?q=40.4129180908203,-80.0293197631836');
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
