const { normalizeEmail, emailsMatch } = require('../../public/Utils/sharedUtils');

// These two helpers back every case-insensitive email comparison and the
// normalize-on-write behavior, so they carry the correctness of the whole flow.

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  John.Doe@Example.COM ')).toBe('john.doe@example.com');
  });

  it('returns empty string for non-strings or missing values', () => {
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(123)).toBe('');
    expect(normalizeEmail({})).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeEmail('  Mixed@Case.io  ');
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe('emailsMatch', () => {
  it('matches ignoring case and surrounding whitespace', () => {
    expect(emailsMatch('John@Example.com', 'john@example.com ')).toBe(true);
    expect(emailsMatch('  USER@DOMAIN.ORG', 'user@domain.org')).toBe(true);
  });

  it('does not match different addresses', () => {
    expect(emailsMatch('a@x.com', 'b@x.com')).toBe(false);
  });

  it('treats two empty/missing emails as NOT a match', () => {
    expect(emailsMatch('', '')).toBe(false);
    expect(emailsMatch(undefined, undefined)).toBe(false);
    expect(emailsMatch(null, '')).toBe(false);
    expect(emailsMatch('a@x.com', '')).toBe(false);
    expect(emailsMatch('', 'a@x.com')).toBe(false);
  });
});

// Mirror of memberNeedsEmailNormalization (backend/members-data-methods.js), which lives in a
// Velo-coupled module and can't be required here. Kept in lockstep so the backfill predicate's
// intent stays under test: a member needs normalization iff a present email field is not equal
// to its own normalized form.
const needsNormalization = member =>
  (typeof member.email === 'string' &&
    member.email.length > 0 &&
    member.email !== normalizeEmail(member.email)) ||
  (typeof member.contactFormEmail === 'string' &&
    member.contactFormEmail.length > 0 &&
    member.contactFormEmail !== normalizeEmail(member.contactFormEmail));

describe('memberNeedsEmailNormalization (mirrored predicate)', () => {
  it('flags non-canonical login email', () => {
    expect(needsNormalization({ email: 'John@X.com', contactFormEmail: 'a@x.com' })).toBe(true);
  });

  it('flags non-canonical contact-form email', () => {
    expect(needsNormalization({ email: 'a@x.com', contactFormEmail: ' a@x.com ' })).toBe(true);
  });

  it('does not flag already-canonical members', () => {
    expect(needsNormalization({ email: 'a@x.com', contactFormEmail: 'b@x.com' })).toBe(false);
  });

  it('ignores empty/missing fields', () => {
    expect(needsNormalization({ email: '', contactFormEmail: '' })).toBe(false);
    expect(needsNormalization({})).toBe(false);
  });
});
