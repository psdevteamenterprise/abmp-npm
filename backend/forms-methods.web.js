const { items: wixData } = require('@wix/data');
const { webMethod, Permissions } = require('@wix/web-methods');

const { COLLECTIONS } = require('../public');

const { triggerAutomation } = require('./automations-methods');
const { CONFIG_KEYS, ELEVATED_QUERY_OPTIONS } = require('./consts');
const { findMemberByWixDataId, createContactAndMemberIfNew } = require('./members-data-methods');
const { getSiteConfigs } = require('./utils');

const contactSubmission = webMethod(Permissions.Anyone, async (data, memberDataId) => {
  const { firstName, lastName, email, phone, message } = data;
  const [memberData, automationEmailTriggerId] = await Promise.all([
    findMemberByWixDataId(memberDataId),
    getSiteConfigs(CONFIG_KEYS.AUTOMATION_EMAIL_TRIGGER_ID),
  ]);
  if (!memberData.showContactForm) {
    console.log('Member contact form is not enabled for user, skipping contact submission!');
    return;
  }
  let memberContactId = memberData.contactId;
  if (!memberContactId) {
    /**
     * Create a member contact here since some members may have never logged in
     * and therefore don’t have a contact ID. However, these members can still
     * appear in the directory, and site visitors can reach out to them if they’ve
     * enabled their contact form. To handle this, we ensure a contact is created for
     * them during this flow if it doesn’t already exist.
     */
    console.info('Member contact id not found for user, creating new contact!');
    const member = await createContactAndMemberIfNew(memberData);
    memberContactId = member.contactId;
  }
  console.log('memberContactId', memberContactId);
  const emailTriggered = await triggerAutomation(automationEmailTriggerId, {
    contactId: memberContactId,
    name: `${firstName} ${lastName}`,
    email: email,
    phone: phone,
    message: message,
  });
  data = {
    ...data,
    phone: Number(data.phone),
    memberContactId: memberContactId,
    memberEmail: memberData.contactFormEmail,
  };
  await wixData.insert(COLLECTIONS.CONTACT_US_SUBMISSIONS, data, ELEVATED_QUERY_OPTIONS);
  return emailTriggered;
});

module.exports = {
  contactSubmission,
};
