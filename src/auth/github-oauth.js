/**
 * Auth module: GitHub OAuth device flow (CLI, no localhost server).
 */

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';

/**
 * Request device and user codes for the device flow (no localhost server).
 * User opens https://github.com/login/device and enters user_code.
 * @param {object} config - { clientId, scope }
 * @returns {Promise<{ deviceCode: string, userCode: string, verificationUri: string, interval: number }>}
 */
export async function requestDeviceCode(config) {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: config.clientId,
      scope: config.scope || 'read:user repo',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub device code request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`GitHub: ${data.error} - ${data.error_description || ''}. Enable Device flow in your OAuth app settings.`);
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri || 'https://github.com/login/device',
    interval: data.interval || 5,
  };
}

/**
 * Poll for access token after user has authorized the device.
 * @param {object} config - { clientId, deviceCode }
 * @returns {Promise<string>} Access token
 */
export async function pollForDeviceToken(config) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: config.clientId,
      device_code: config.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await response.json();
  if (data.error) {
    if (data.error === 'authorization_pending' || data.error === 'slow_down') {
      return null; // keep polling
    }
    throw new Error(`GitHub: ${data.error} - ${data.error_description || ''}`);
  }
  if (!data.access_token) throw new Error('GitHub did not return an access token');
  return data.access_token;
}
