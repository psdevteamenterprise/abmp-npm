const { location: wixLocationFrontend } = require('@wix/site-location');
const { authentication } = require('@wix/site-members');
const { local } = require('@wix/site-storage');

async function qaPageOnReady({ $w: _$w, loginQAMember }) {
  try {
    const { userEmail, secret, redirectTo, ...restQueryParams } = await wixLocationFrontend.query();

    if (!userEmail || !secret) {
      throw new Error('Missing required parameters: userEmail and/or secret');
    }

    const result = await loginQAMember(userEmail, secret);

    if (!result.success || !result.token) {
      throw new Error(result.error || 'Login failed');
    }

    await authentication.applySessionToken(result.token);
    console.log('QA user logged in successfully');

    await local.setItem('memberId', result.memberCMSId);
    const queryParams = new URLSearchParams({ ...restQueryParams, token: result.memberCMSId });
    const redirectUrl = redirectTo ? `/${redirectTo}?${queryParams.toString()}` : '/';

    await wixLocationFrontend.to(redirectUrl);
  } catch (error) {
    console.error('QA login failed:', error);

    const qaTextElement = _$w('#qaText');
    if (qaTextElement) {
      qaTextElement.text = 'Login failed: ' + (error.message || 'Unknown error');
    }
  }
}

module.exports = {
  qaPageOnReady,
};
