#!/usr/bin/env node
/**
 * Export LLM-ready payloads (JSON) for all merged PRs to files.
 * Each file is the exact JSON that would be sent to the LLM as input.
 *
 * Needs: GITHUB_TOKEN in .env or .github-token file.
 * Run: node src/scripts/export-llm-payloads.js
 * Output: llm-payloads/{owner_repo_PR123_2025-11-06}.json
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createOctokit, fetchMergedPRsForUser, enrichPR } from '../github/pr-fetcher.js';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'llm-payloads');
const TOKEN_FILE = path.join(ROOT, '.github-token');

async function getToken() {
  const env = process.env.GITHUB_TOKEN;
  if (env) return env.trim();
  try {
    const content = await fs.readFile(TOKEN_FILE, 'utf8');
    return content.trim();
  } catch {
    return null;
  }
}

async function main() {
  const token = await getToken();
  if (!token) {
    console.error('Need GITHUB_TOKEN in .env or .github-token file.');
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`Output folder: ${OUT_DIR}`);

  console.log('Fetching merged PRs from GitHub...');
  const octokit = createOctokit(token);
  const prs = await fetchMergedPRsForUser(octokit);
  console.log(`Found ${prs.length} merged PR(s). Exporting...`);

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const stem = prToStem(pr);
    const repo = pr.repoFullName || pr.base?.repo?.full_name || '?';

    try {
      const enriched = await enrichPR(octokit, pr);
      const pkg = prToLLMPackage(enriched);

      const json = JSON.stringify(pkg, null, 2);
      const filepath = path.join(OUT_DIR, `${stem}.json`);
      await fs.writeFile(filepath, json, 'utf8');
      console.log(`  [${i + 1}/${prs.length}] ${stem}.json`);
    } catch (e) {
      console.error(`  [${i + 1}/${prs.length}] ${stem} FAILED: ${e.message}`);
    }
  }

  console.log(`Done. ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
