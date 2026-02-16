/**
 * Sync PR summaries to Notion.
 */

import fs from 'fs/promises';
import path from 'path';
import { createNotionClient, createPage, appendBlocksToPage } from './client.js';
import { markdownToNotionBlocks } from './blocks.js';
import { loadCache, saveCache } from './cache.js';

/**
 * Create a Notion page from summary markdown (no file).
 * @param {object} notion - Notion client
 * @param {string} stem - e.g. owner_repo_PR123_date
 * @param {string} summaryMarkdown - Summary content (markdown)
 * @param {object} options - Parent config
 * @returns {Promise<{ id: string, url: string }>}
 */
export async function createSummaryPageFromMarkdown(notion, stem, summaryMarkdown, options) {
  const title = stem.replace(/_/g, ' / ').replace(/-/g, ' ');
  const blocks = markdownToNotionBlocks(summaryMarkdown);
  return createPage(notion, {
    parentType: options.parentType,
    parentId: options.parentId,
    title,
    blocks,
    titleProperty: options.titleProperty,
  });
}

/**
 * Sync a single summary file to Notion.
 * @param {object} notion - Notion client
 * @param {string} summaryPath - Path to _summary.md file
 * @param {object} options - Parent config
 * @returns {Promise<{ id: string, url: string }>}
 */
export async function syncSummaryToNotion(notion, summaryPath, options) {
  const content = await fs.readFile(summaryPath, 'utf8');
  const stem = path.basename(summaryPath, '_summary.md');
  return createSummaryPageFromMarkdown(notion, stem, content, options);
}


/**
 * Sync all summaries from a directory to Notion.
 * @param {string} summariesDir - Path to summaries folder
 * @param {object} options - Notion parent config
 * @param {boolean} [options.force] - Bypass cache and create new pages
 * @returns {Promise<Array<{ stem: string, id: string, url: string, cached: boolean }>>}
 */
export async function syncSummariesToNotion(summariesDir, options) {
  const notion = createNotionClient(options.apiKey);
  const entries = await fs.readdir(summariesDir);
  const files = entries.filter((e) => e.endsWith('_summary.md'));

  const cachePath = options.cachePath || 'notion-sync-cache.json';
  const cache = options.force ? {} : await loadCache(cachePath);

  const results = [];
  for (const file of files) {
    const summaryPath = path.join(summariesDir, file);
    const stem = file.replace(/_summary\.md$/, '');
    const cachedId = cache[stem];

    if (cachedId) {
      const url = `https://notion.so/${cachedId.replace(/-/g, '')}`;
      results.push({ stem, id: cachedId, url, cached: true });
      continue;
    }

    const { id, url } = await syncSummaryToNotion(notion, summaryPath, options);
    cache[stem] = id;
    results.push({ stem, id, url, cached: false });
  }

  await saveCache(cache, cachePath);
  return results;
}

/**
 * Append a PR summary to an existing page.
 * Adds: heading_2 (PR title), summary blocks, divider.
 * @param {object} notion - Notion client
 * @param {string} pageId - Target page ID to append to
 * @param {string} stem - e.g. owner_repo_PR123_date
 * @param {string} summaryMarkdown - Summary content (markdown)
 */
export async function appendSummaryToPage(notion, pageId, stem, summaryMarkdown) {
  const title = stem.replace(/_/g, ' / ').replace(/-/g, ' ');
  const summaryBlocks = markdownToNotionBlocks(summaryMarkdown);
  const divider = { object: 'block', type: 'divider', divider: {} };
  const blocks = [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: title, link: null } }] } },
    ...summaryBlocks,
    divider,
  ];
  await appendBlocksToPage(notion, pageId, blocks);
}
