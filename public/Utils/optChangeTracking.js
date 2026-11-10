/**
 * Describes an opt in/out change on the Personal Details page so it can be recorded in the
 * ButtonClicks collection next to the three Save buttons. PAC asked for a history of when a
 * member opted in or out of the directory (ticket 13052192386); until now the opt checkboxes
 * saved straight from their confirmation dialog and left no trace.
 *
 * Two fields are tracked. `optOut` is true when the member is OUT of the directory, while
 * `showWixUrl` is true when the member is IN (showing the free website), so the "opt-out" /
 * "opt-in" wording is derived per field rather than from the raw boolean.
 */

const OPT_FIELDS = {
  optOut: { buttonName: 'Directory Opt In/Out', optedOutValue: true },
  showWixUrl: { buttonName: 'Free Website Opt In/Out', optedOutValue: false },
};

const OPT_ACTIONS = {
  OPT_OUT: 'opt-out',
  OPT_IN: 'opt-in',
  UNCHANGED: 'unchanged',
};

const isTrackedOptField = field => Object.prototype.hasOwnProperty.call(OPT_FIELDS, field);

const optActionFor = (field, previousValue, nextValue) => {
  if (Boolean(previousValue) === Boolean(nextValue)) return OPT_ACTIONS.UNCHANGED;
  return Boolean(nextValue) === OPT_FIELDS[field].optedOutValue
    ? OPT_ACTIONS.OPT_OUT
    : OPT_ACTIONS.OPT_IN;
};

/**
 * @param {Object} change
 * @param {string} change.field - 'optOut' or 'showWixUrl'
 * @param {boolean} change.previousValue - value stored before the save
 * @param {boolean} change.nextValue - value the member asked for
 * @param {boolean} change.saved - whether the save succeeded
 * @returns {{ buttonName: string, data: Object } | null} - the trackClick payload, or null for a
 *   field that is not an opt checkbox
 */
const describeOptChange = ({ field, previousValue, nextValue, saved }) => {
  if (!isTrackedOptField(field)) return null;
  return {
    buttonName: OPT_FIELDS[field].buttonName,
    data: {
      field,
      previousValue: Boolean(previousValue),
      nextValue: Boolean(nextValue),
      action: optActionFor(field, previousValue, nextValue),
      saved: Boolean(saved),
    },
  };
};

module.exports = { OPT_ACTIONS, OPT_FIELDS, describeOptChange, isTrackedOptField };
