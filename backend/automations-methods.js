const { customTrigger } = require('@wix/automations');
const { auth } = require('@wix/essentials');
const triggerMethod = auth.elevate(customTrigger.runTrigger);

const triggerAutomation = async (triggerId, payload) =>
  await triggerMethod({
    triggerId,
    payload,
  });

module.exports = {
  triggerAutomation,
};
