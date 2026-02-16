/**
 * Cache mapping PR summary stem (owner_repo_PR123_date) to Notion page ID.
 * Prevents duplicate pages when running sync multiple times.
 */

import fs from 'fs/promises';
import path from 'path';

const DEFAULT_CACHE_FILE = 'notion-sync-cache.json';

/**
 * Load cache from disk.
 * @param {string} [cachePath]
 * @returns {Promise<Record<string, string>>} stem -> page_id
 */
export async function loadCache(cachePath = DEFAULT_CACHE_FILE) {
  const fullPath = path.resolve(process.cwd(), cachePath);
  try {
    const content = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save cache to disk.
 * @param {Record<string, string>} cache
 * @param {string} [cachePath]
 */
export async function saveCache(cache, cachePath = DEFAULT_CACHE_FILE) {
  const fullPath = path.resolve(process.cwd(), cachePath);
  await fs.writeFile(fullPath, JSON.stringify(cache, null, 2), 'utf8');
}
