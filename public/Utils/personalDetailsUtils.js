// handle custom validation for url inputs
function handleOnCustomValidation(element) {
  element.onCustomValidation((value, reject) => {
    if (isNotValidUrl(value)) {
      reject('Please enter a valid URL');
    }
  });
}

// check if url is not valid using regex
function isNotValidUrl(url) {
  // Empty URLs are considered valid (optional field)
  if (!url) return false;

  // URL must start with protocol OR www - handles all TLDs including multi-level and query params
  // NOTE: the host class is `[\da-z.-]` (digit, letter, dot, hyphen). It previously read
  // `[da-z.-]`, which - missing the backslash - matched only a literal "d" plus a-z, so any
  // domain containing a digit was rejected (e.g. https://patty-10439.square.site).
  // The `i` flag keeps mixed-case hosts valid; domains are case-insensitive.
  const urlRegex =
    /^(https?:\/\/|www\.)([\da-z.-]+)\.([a-z.]{2,})([/\w .-]*)*(\?[&\w=.-]*)?(#[&\w=.-]*)?\/?$/i;

  return !urlRegex.test(url);
}

module.exports = {
  handleOnCustomValidation,
  isNotValidUrl,
};
