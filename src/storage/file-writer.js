/**
 * Storage module: write raw PR JSON to .txt files.
 */

import fs from 'fs/promises';
import path from 'path';

const DEFAULT_OUTPUT_DIR = 'pr-snapshots';

/**
 * Ensure output directory exists.
 * @param {string} [outputDir] - Directory for .txt files
 */
export async function ensureOutputDir(outputDir = DEFAULT_OUTPUT_DIR) {
  const dir = path.resolve(process.cwd(), outputDir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Generate a safe filename for a PR: repo-owner_repo-name_PR123_merged-date.txt
 * @param {object} pr - PR object with repo info and number
 * @param {string} [suffix] - Suffix before .txt (e.g. '_files')
 * @returns {string}
 */
export function prToFilename(pr, suffix = '') {
  const repoName = pr.repoFullName || pr.base?.repo?.full_name || 'unknown';
  const safeRepo = repoName.replace(/\//g, '_');
  const merged = pr.merged_at ? pr.merged_at.slice(0, 10) : 'unknown';
  return `${safeRepo}_PR${pr.number}_${merged}${suffix}.txt`;
}

/**
 * Write one PR's raw JSON to a .txt file.
 * @param {object} pr - Full PR object (enriched or not)
 * @param {string} [outputDir] - Directory for .txt files
 * @returns {Promise<string>} Path of the written file
 */
export async function writePRToFile(pr, outputDir = DEFAULT_OUTPUT_DIR) {
  const dir = await ensureOutputDir(outputDir);
  const filename = prToFilename(pr);
  const filepath = path.join(dir, filename);
  const content = JSON.stringify(pr, null, 2);
  await fs.writeFile(filepath, content, 'utf8');
  return filepath;
}

/**
 * Write one PR's pulls.listFiles JSON to a separate _files.txt file.
 * @param {object} pr - PR object (for filename)
 * @param {Array} listFiles - Result of pulls.listFiles
 * @param {string} [outputDir] - Directory for .txt files
 * @returns {Promise<string|null>} Path of the written file, or null if no listFiles
 */
export async function writePRFilesToFile(pr, listFiles, outputDir = DEFAULT_OUTPUT_DIR) {
  if (!listFiles || !Array.isArray(listFiles)) return null;
  const dir = await ensureOutputDir(outputDir);
  const filename = prToFilename(pr, '_files');
  const filepath = path.join(dir, filename);
  const content = JSON.stringify(listFiles, null, 2);
  await fs.writeFile(filepath, content, 'utf8');
  return filepath;
}

/**
 * Write multiple PRs to individual .txt files.
 * Also writes pulls.listFiles to a separate _files.txt per PR.
 * @param {Array<object>} prs - Array of PR objects (may have listFiles)
 * @param {string} [outputDir] - Directory for .txt files
 * @returns {Promise<string[]>} Paths of all written files (main + _files)
 */
export async function writePRsToFiles(prs, outputDir = DEFAULT_OUTPUT_DIR) {
  const paths = [];
  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const listFiles = pr.listFiles;
    if (listFiles !== undefined) delete pr.listFiles;

    const p = await writePRToFile(pr, outputDir);
    paths.push(p);
    console.log(`[Storage] Wrote ${i + 1}/${prs.length}: ${path.basename(p)}`);

    if (listFiles?.length) {
      const pf = await writePRFilesToFile(pr, listFiles, outputDir);
      if (pf) {
        paths.push(pf);
        console.log(`[Storage] Wrote ${path.basename(pf)}`);
      }
    }
  }
  return paths;
}
