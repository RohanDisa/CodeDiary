/**
 * GitHub module: fetch merged PRs with metadata, diffs, and review comments.
 * Uses @octokit/rest with the user's OAuth token.
 */

import { Octokit } from '@octokit/rest';

/**
 * Create an authenticated Octokit client.
 * @param {string} accessToken - GitHub OAuth access token
 * @returns {Octokit}
 */
export function createOctokit(accessToken) {
  return new Octokit({
    auth: accessToken,
  });
}

/**
 * Fetch all merged PRs for the authenticated user.
 * Filter: state === 'closed' && merged_at !== null.
 * @param {Octokit} octokit
 * @returns {Promise<Array>} List of merged PRs (search results items)
 */
export async function fetchMergedPRsForUser(octokit) {
  const { data: user } = await octokit.rest.users.getAuthenticated();
  const login = user.login;
  console.log(`[GitHub] Authenticated as ${login}`);

  const prs = [];
  let page = 1;
  const perPage = 30;

  // Search: PRs closed and merged, author = current user
  while (true) {
    console.log(`[GitHub] Searching merged PRs (page ${page})...`);
    const { data } = await octokit.rest.search.issuesAndPullRequests({
      q: `author:${login} is:merged type:pr`,
      sort: 'updated',
      order: 'desc',
      per_page: perPage,
      page,
    });

    if (!data.items.length) break;
    console.log(`[GitHub] Page ${page}: ${data.items.length} item(s)`);

    for (const item of data.items) {
      // Search returns issues; we need full PR with merged_at
      const full = await octokit.rest.pulls.get({
        owner: item.repository_url.split('/').slice(-2)[0],
        repo: item.repository_url.split('/').slice(-1)[0],
        pull_number: item.number,
      });
      if (full.data.merged_at) {
        prs.push({ ...full.data, repoFullName: full.data.base.repo.full_name });
      }
    }
    if (data.items.length < perPage) break;
    page++;
  }

  return prs;
}

/**
 * Enrich a single PR with diff/patch, review comments, and issue links.
 * @param {Octokit} octokit
 * @param {object} pr - PR from fetchMergedPRsForUser (has repoFullName or base.repo)
 * @returns {Promise<object>} PR with diff, reviewComments, linkedIssues
 */
export async function enrichPR(octokit, pr) {
  const [owner, repo] = (pr.repoFullName || pr.base?.repo?.full_name || '').split('/');
  const pullNumber = pr.number;

  const [pullPatch, reviewComments, listFiles] = await Promise.all([
    getPRDiff(octokit, owner, repo, pullNumber),
    getReviewComments(octokit, owner, repo, pullNumber),
    getPRListFiles(octokit, owner, repo, pullNumber),
  ]);

  const rawLinked = extractLinkedIssues(pr.body || '');
  if (rawLinked.length) console.log(`[GitHub] Fetching ${rawLinked.length} linked issue(s) for ${owner}/${repo} #${pullNumber}`);
  const linkedIssues = await Promise.all(
    rawLinked.map(async ({ number }) => {
      let title = null;
      let body = null;
      try {
        const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: number });
        title = data.title ?? '';
        body = data.body ?? '';
      } catch {
        // ignore - issue may be in another repo or inaccessible
      }
      return { number, title, body };
    })
  );

  return {
    ...pr,
    diff: pullPatch,
    reviewComments,
    linkedIssues,
    listFiles,
  };
}

/**
 * Get list of changed files for a PR (includes per-file patch).
 */
async function getPRListFiles(octokit, owner, repo, pullNumber) {
  try {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return data || [];
  } catch (e) {
    return [];
  }
}

/**
 * Get the diff/patch for a PR (merge commit or files changed).
 */
async function getPRDiff(octokit, owner, repo, pullNumber) {
  try {
    const { data } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      mediaType: { format: 'diff' },
    });
    return typeof data === 'string' ? data : null;
  } catch (e) {
    return null;
  }
}

/**
 * Get review comments for a PR.
 */
async function getReviewComments(octokit, owner, repo, pullNumber) {
  try {
    const { data } = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return data || [];
  } catch (e) {
    return [];
  }
}

/**
 * Simple extraction of issue refs from body (e.g. "Fixes #123").
 */
function extractLinkedIssues(body) {
  const refs = [];
  const re = /#(\d+)/g;
  let m;
  while ((m = re.exec(body)) !== null) refs.push({ number: parseInt(m[1], 10) });
  return refs;
}
