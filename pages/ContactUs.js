const { lightbox } = require('@wix/site-window');
const { phone } = require('phone');

// const { contactSubmission } = require('../backend/forms-methods.web.js');
const { VALIDATION_MESSAGES, REGEX } = require('../public');

async function contactUsOnReady({ $w: _$w, contactSubmission }) {
  _$w('#submitButton').disable();
  const receivedData = await lightbox.getContext();
  const formFieldsSelectors = ['#firstName', '#lastName', '#email', '#phone', '#message'];
  const inputOnCustomValidation = ({ value, reject, message, pattern }) => {
    const isValid = typeof value === 'string' && pattern.test(value.trim());
    if (!isValid) reject(message);
  };
  async function validateAllFields() {
    let allValid = true;
    for (const selector of formFieldsSelectors) {
      const isValid = await _$w(selector).valid;
      _$w(selector).updateValidityIndication();
      if (!isValid) {
        allValid = false;
      }
    }
    return allValid;
  }

  function resetForm() {
    formFieldsSelectors.forEach(selector => {
      const field = _$w(selector);
      if (field && field.reset) {
        field.reset();
      } else {
        field.value = '';
      }
      if (field && field.resetValidityIndication) {
        field.resetValidityIndication();
      }
    });
  }

  function setAlertMessage(message) {
    const $message = _$w('#successMessage');
    $message.text = message;
    $message.expand();

    setTimeout(() => {
      $message.collapse();
    }, 8000);
  }
  // First Name
  _$w('#firstName').onCustomValidation((value, reject) => {
    inputOnCustomValidation({
      value,
      reject,
      message: VALIDATION_MESSAGES.CONTACT_US.FIRST_NAME,
      pattern: REGEX.NAME,
    });
  });
  // Last Name
  _$w('#lastName').onCustomValidation((value, reject) => {
    inputOnCustomValidation({
      value,
      reject,
      message: VALIDATION_MESSAGES.CONTACT_US.LAST_NAME,
      pattern: REGEX.NAME,
    });
  });
  // Message
  _$w('#message').onCustomValidation((value, reject) => {
    inputOnCustomValidation({
      value,
      reject,
      message: VALIDATION_MESSAGES.CONTACT_US.MESSAGE,
      pattern: REGEX.MESSAGE,
    });
  });

  // Email validation uses native input validation
  // No custom validation needed as email input has built-in validation

  // Phone (US format)
  _$w('#phone').onCustomValidation((value, reject) => {
    const { isValid } = phone(value, { country: 'US' });
    if (!isValid) {
      reject(VALIDATION_MESSAGES.CONTACT_US.PHONE);
    }
  });
  _$w('#captchaInput').onVerified(async () => {
    const allValid = await validateAllFields();
    if (allValid) {
      _$w('#submitButton').enable();
      return;
    }
    _$w('#submitButton').disable();
    setAlertMessage(VALIDATION_MESSAGES.CONTACT_US.CAPTCHA);
    _$w('#captchaInput').reset();
  });

  _$w('#captchaInput').onTimeout(() => {
    _$w('#submitButton').disable();
  });
  _$w('#submitButton').onClick(async () => {
    const allValid = await validateAllFields();
    if (!allValid) {
      setAlertMessage(VALIDATION_MESSAGES.CONTACT_US.INVALID_FIELDS);
      return;
    }

    try {
      const formData = {
        firstName: _$w('#firstName').value,
        lastName: _$w('#lastName').value,
        email: _$w('#email').value,
        phone: _$w('#phone').value,
        message: _$w('#message').value,
      };

      await contactSubmission(formData, receivedData._id);
      await resetForm();

      setAlertMessage(VALIDATION_MESSAGES.CONTACT_US.SUBMISSION_SUCCESS);
    } catch (error) {
      console.error('Submission failed:', error);
      setAlertMessage(VALIDATION_MESSAGES.CONTACT_US.SUBMISSION_FAILED);
    }
  });
}

module.exports = {
  contactUsOnReady,
};
