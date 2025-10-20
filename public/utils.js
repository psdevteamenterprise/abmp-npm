/**
 * Generate a unique ID
 * @returns {string} Unique identifier
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if URL is not valid using regex
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is invalid
 */
function isNotValidUrl(url) {
  // Empty URLs are considered valid (optional field)
  if (!url) return false;

  // URL must start with protocol OR www - handles all TLDs including multi-level and query params
  const urlRegex =
    /^(https?:\/\/|www\.)([\da-z\.-]+)\.([a-z\.]{2,})([\/\w \.-]*)*(\?[&\w=.-]*)?(\#[&\w=.-]*)?\/?$/;

  return !urlRegex.test(url);
}

/**
 * Handle custom validation for URL inputs
 * @param {Object} element - Wix $w element
 */
function handleOnCustomValidation(element) {
  element.onCustomValidation((value, reject) => {
    if (isNotValidUrl(value)) {
      reject('Please enter a valid URL');
    }
  });
}

module.exports = {
  generateId,
  isNotValidUrl,
  handleOnCustomValidation,
};

