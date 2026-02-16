#!/usr/bin/env node
/**
 * Sync PRs to Notion in one command.
 * - If GITHUB_TOKEN (PAT) in .env: use it, no login
 * - Else: use device flow (open GitHub login page, enter code), save token, then sync
 * - Fetch PRs from GitHub → summarize with Gemini → write to Notion
 * Usage: node src/scripts/sync.js [--force] [--limit N]
 */

import 'dotenv/config';
import fs from 'fs/promises';
import readline from 'readline';
import { exec } from 'child_process';
import { createOctokit, fetchMergedPRsForUser, enrichPR } from '../github/pr-fetcher.js';
import { summarizePR } from '../services/pr-summarizer.js';

function prToStem(pr) {
  const repoName = pr.repoFullName || pr.base?.repo?.full_name || 'unknown';
  const safeRepo = repoName.replace(/\//g, '_');
  const merged = pr.merged_at ? pr.merged_at.slice(0, 10) : 'unknown';
  return `${safeRepo}_PR${pr.number}_${merged}`;
}

function prToLLMPackage(pr) {
  const listFiles = pr.listFiles || [];
  const linkedIssues = (pr.linkedIssues || []).map(({ number, title, body }) => ({
    number,
    title: title ?? null,
    body: body ?? null,
  }));
  const filesAndPatches = listFiles.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch || null,
  }));
  const rawComments = pr.reviewComments || [];
  const hunkToId = new Map();
  const diffHunks = {};
  let hunkIndex = 0;
  for (const c of rawComments) {
    const h = c.diff_hunk;
    if (!h) continue;
    if (!hunkToId.has(h)) {
      const id = `hunk_${++hunkIndex}`;
      hunkToId.set(h, id);
      diffHunks[id] = h;
    }
  }
  const comments = rawComments.map((c) => {
    const out = { path: c.path, body: c.body };
    if (c.diff_hunk) out.hunkRef = hunkToId.get(c.diff_hunk);
    return out;
  });
  const pkg = {
    linkedIssues,
    metadata: {
      title: pr.title,
      body: pr.body || '',
      mergedAt: pr.merged_at,
      number: pr.number,
      htmlUrl: pr.html_url,
    },
    filesAndPatches,
    comments,
  };
  if (Object.keys(diffHunks).length) pkg.diffHunks = diffHunks;
  return pkg;
}
import { createNotionClient } from '../notion/client.js';
import { appendSummaryToPage } from '../notion/sync.js';
import { loadCache, saveCache } from '../notion/cache.js';
import { requestDeviceCode, pollForDeviceToken } from '../auth/github-oauth.js';
import { getGitHubOAuthConfig } from '../config.js';

const TOKEN_FILE = '.github-token';
const CACHE_PATH = 'notion-sync-cache.json';

function askHowManyPRs(total) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      const limit = process.env.PR_LIMIT ? Math.min(parseInt(process.env.PR_LIMIT, 10) || total, total) : total;
      resolve(limit);
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = `How many PRs to summarize? (1-${total}, or "all"): `;
    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = (answer || 'all').trim().toLowerCase();
      if (trimmed === 'all' || trimmed === '') {
        resolve(total);
      } else {
        const n = parseInt(trimmed, 10);
        resolve(Number.isFinite(n) && n > 0 ? Math.min(n, total) : total);
      }
    });
  });
}

async function getToken() {
  const env = process.env.GITHUB_TOKEN;
  if (env) return env;
  try {
    const content = await fs.readFile(TOKEN_FILE, 'utf8');
    return content.trim();
  } catch {
    return null;
  }
}

async function runSync(token) {
  const force = process.argv.includes('--force');

  const apiKey = process.env.NOTION_API_KEY;
  const pageId = process.env.NOTION_PAGE_ID;
  if (!apiKey || !pageId) {
    throw new Error('Notion env missing: set NOTION_API_KEY and NOTION_PAGE_ID (the page to append PRs to)');
  }

  const notion = createNotionClient(apiKey);
  const cache = force ? {} : await loadCache(CACHE_PATH);

  console.log('Fetching merged PRs from GitHub...');
  const octokit = createOctokit(token);
  let prs = await fetchMergedPRsForUser(octokit);
  const total = prs.length;
  console.log(`Found ${total} merged PR(s)`);

  const limitIdx = process.argv.indexOf('--limit');
  const limitArg = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : null;
  const limit = limitArg != null && Number.isFinite(limitArg) && limitArg > 0
    ? Math.min(limitArg, total)
    : await askHowManyPRs(total);

  prs = prs.slice(0, limit);
  console.log(`Cool! Top ${prs.length} PR(s) will be summarized.`);
  console.log('Top = most recently updated');

  const pageUrl = `https://notion.so/${pageId.replace(/-/g, '')}`;

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const stem = prToStem(pr);
    const repo = pr.repoFullName || pr.base?.repo?.full_name || '?';

    if (cache[stem] && !force) {
      console.log(`[${i + 1}/${prs.length}] ${stem} -> cached`);
      continue;
    }

    try {
      console.log(`[${i + 1}/${prs.length}] ${repo} #${pr.number} - enriching...`);
      const enriched = await enrichPR(octokit, pr);

      const pkg = prToLLMPackage(enriched);
      const summary = await summarizePR(pkg);

      await appendSummaryToPage(notion, pageId, stem, summary);
      cache[stem] = true;
      console.log(`[${i + 1}/${prs.length}] ${stem} -> appended`);
    } catch (e) {
      console.error(`[${i + 1}/${prs.length}] ${stem} FAILED: ${e.message}`);
    }
  }

  await saveCache(cache, CACHE_PATH);
  console.log('Done.');
  console.log(`Page: ${pageUrl}`);
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function runDeviceFlowLogin() {
  const config = getGitHubOAuthConfig();

  const { deviceCode, userCode, verificationUri, interval } = await requestDeviceCode({
    clientId: config.clientId,
    scope: config.scope,
  });

  console.log(`Open ${verificationUri} and enter code: ${userCode}`);
  openBrowser(verificationUri);

  while (true) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    const token = await pollForDeviceToken({ clientId: config.clientId, deviceCode });
    if (token) {
      await fs.writeFile(TOKEN_FILE, token, 'utf8');
      return token;
    }
  }
}

async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  const pageId = process.env.NOTION_PAGE_ID;
  if (!apiKey || !pageId) {
    console.error('Notion env missing: set NOTION_API_KEY and NOTION_PAGE_ID (the page to append PRs to)');
    process.exit(1);
  }

  let token = await getToken();

  if (!token) {
    try {
      token = await runDeviceFlowLogin();
    } catch (e) {
      console.error(e.message || e);
      process.exit(1);
    }
  }

  try {
    await runSync(token);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}

main();
