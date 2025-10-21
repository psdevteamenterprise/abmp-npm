/**
 * Generate a unique ID
 * @returns {string} Unique identifier
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Formats an array of practice areas, showing as many as fit within 70 characters
 * @param {Array} areaOfPractices - Array of practice area strings
 * @returns {string} Formatted string of practice areas
 */
function prepareText(areaOfPractices = []) {
  // always return a string
  if (!Array.isArray(areaOfPractices) || areaOfPractices.length === 0) {
    return '';
  }

  // Filter out null/undefined/empty
  const validAreas = areaOfPractices.filter(
    area => area !== null && area !== undefined && area !== ''
  );

  if (validAreas.length === 0) {
    return '';
  }

  if (validAreas.length === 1) {
    return validAreas[0].length > 70 ? validAreas[0].substring(0, 67) + '...' : validAreas[0];
  }

  // build up to 70-char string
  let current = '';
  const visible = [];
  for (const item of validAreas) {
    const sep = visible.length ? ', ' : '';
    const next = current + sep + item;
    if (next.length > 70) break;
    visible.push(item);
    current = next;
  }

  // if nothing fit, at least show the first (truncated)
  if (visible.length === 0) {
    const first = validAreas[0];
    return first.length > 67 ? first.substring(0, 67) + '...' : first;
  }

  const remaining = validAreas.length - visible.length;
  return remaining > 0 ? `${visible.join(', ')}, +${remaining} Techniques` : visible.join(', ');
}

module.exports = {
  generateId,
  prepareText,
};
