/**
 * App configuration from environment.
 * Used for GitHub OAuth device flow (CLI). Set GITHUB_CLIENT_ID in .env.
 */
function getGitHubOAuthConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing GITHUB_CLIENT_ID. Set it in .env (see .env.example).');
  }
  return {
    clientId,
    scope: 'read:user repo',
  };
}

export { getGitHubOAuthConfig };
