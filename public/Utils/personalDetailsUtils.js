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
  const urlRegex =
    /^(https?:\/\/|www\.)([da-z.-]+)\.([a-z.]{2,})([/\w .-]*)*(\?[&\w=.-]*)?(#[&\w=.-]*)?\/?$/;

  return !urlRegex.test(url);
}

module.exports = {
  handleOnCustomValidation,
  isNotValidUrl,
};
