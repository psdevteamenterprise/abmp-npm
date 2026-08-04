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

  // Handles all TLDs including multi-level, plus paths, query strings and anchors.
  //
  // The protocol is OPTIONAL. Members routinely type a bare hostname such as
  // "patty-10439.square.site", which is what they see in their browser. Requiring
  // http:// or www. rejected that and blocked the whole Business & Services save.
  // getContactAndBookingData already runs the value through normalizeExternalUrl on
  // save, so a bare hostname is stored with https:// prepended - accepting it here
  // is what lets that happen.
  //
  // Dropping the explicit `www.` branch loses nothing: "www.example.com" still
  // matches as host "www.example" plus TLD ".com".
  //
  // The host class is `[\da-z.-]` (digit, letter, dot, hyphen). It once read
  // `[da-z.-]`, which - missing the backslash - matched only a literal "d" plus a-z,
  // so any domain containing a digit was rejected. The `i` flag keeps mixed-case
  // hosts valid; domains are case-insensitive.
  const urlRegex =
    /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,})([/\w .-]*)*(\?[&\w=.-]*)?(#[&\w=.-]*)?\/?$/i;

  return !urlRegex.test(url);
}

module.exports = {
  handleOnCustomValidation,
  isNotValidUrl,
};
