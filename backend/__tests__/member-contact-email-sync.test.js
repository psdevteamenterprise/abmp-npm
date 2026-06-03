// Mock the CRM layer so the orchestration logic can be tested without @wix runtime.
// (jest.mock is hoisted above the require calls regardless of placement.)
jest.mock('../contacts-methods', () => ({
  createSiteContact: jest.fn(),
  updateContactInfo: jest.fn(),
  deleteSiteContact: jest.fn(),
}));

const { normalizeEmail, emailsMatch } = require('../../public/Utils/sharedUtils');
const { createSiteContact, updateContactInfo, deleteSiteContact } = require('../contacts-methods');
const { updateMemberContactInfo } = require('../member-contact-orchestration');

// ─── Helper: email normalization / matching ─────────────────────────

describe('email comparison helpers', () => {
  test('normalizeEmail lowercases and trims', () => {
    expect(normalizeEmail('  OnSiteMassageLA@Gmail.com ')).toBe('onsitemassagela@gmail.com');
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(null)).toBe('');
  });

  test('emailsMatch is case-insensitive', () => {
    expect(emailsMatch('OnSiteMassageLA@gmail.com', 'onsitemassagela@gmail.com')).toBe(true);
    expect(emailsMatch('a@b.com', ' A@B.COM ')).toBe(true);
  });

  test('emailsMatch treats different emails as no match', () => {
    expect(emailsMatch('a@b.com', 'c@d.com')).toBe(false);
  });

  test('emailsMatch never matches when either side is empty', () => {
    expect(emailsMatch('', '')).toBe(false);
    expect(emailsMatch('a@b.com', '')).toBe(false);
    expect(emailsMatch(undefined, undefined)).toBe(false);
  });
});

// ─── updateMemberContactInfo → updateContactEmail branch behavior ────

describe('updateMemberContactInfo: contact email vs login email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('separate entity: contact email changed to match login (different casing) collapses to single entity', async () => {
    // Reproduces the production bug: contactFormEmail differs only by case from the login email.
    const existingMemberData = {
      memberId: 926057,
      firstName: 'Ritual',
      lastName: 'Therapy',
      email: 'OnSiteMassageLA@gmail.com', // login email (mixed case)
      contactFormEmail: 'onsitemassagela@mail.com', // old typo'd form email
      wixContactId: 'fd729c5f-separate-contact',
      wixMemberId: 'f0457c38-member-contact',
    };
    const data = { ...existingMemberData, contactFormEmail: 'onsitemassagela@gmail.com' };

    const result = await updateMemberContactInfo(data, existingMemberData);

    // Should delete the now-redundant separate contact and point wixContactId at the member contact.
    expect(deleteSiteContact).toHaveBeenCalledWith('fd729c5f-separate-contact');
    expect(updateContactInfo).not.toHaveBeenCalled();
    expect(createSiteContact).not.toHaveBeenCalled();
    expect(result.wixContactId).toBe('f0457c38-member-contact');
  });

  test('separate entity: contact email changed to a genuinely different email updates the contact', async () => {
    const existingMemberData = {
      memberId: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'login@gmail.com',
      contactFormEmail: 'old-form@gmail.com',
      wixContactId: 'contact-1',
      wixMemberId: 'member-1',
    };
    const data = { ...existingMemberData, contactFormEmail: 'new-form@gmail.com' };

    await updateMemberContactInfo(data, existingMemberData);

    expect(updateContactInfo).toHaveBeenCalledTimes(1);
    expect(deleteSiteContact).not.toHaveBeenCalled();
    expect(createSiteContact).not.toHaveBeenCalled();
  });

  test('no contact email change does not touch CRM email', async () => {
    const existingMemberData = {
      memberId: 1,
      firstName: 'A',
      lastName: 'B',
      email: 'login@gmail.com',
      contactFormEmail: 'form@gmail.com',
      wixContactId: 'contact-1',
      wixMemberId: 'member-1',
    };
    const data = { ...existingMemberData }; // nothing changed

    await updateMemberContactInfo(data, existingMemberData);

    expect(updateContactInfo).not.toHaveBeenCalled();
    expect(deleteSiteContact).not.toHaveBeenCalled();
    expect(createSiteContact).not.toHaveBeenCalled();
  });
});
