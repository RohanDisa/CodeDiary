/**
 * Notion API client for creating pages with PR summaries.
 */

import { Client } from '@notionhq/client';

export function createNotionClient(apiKey) {
  if (!apiKey) {
    throw new Error('NOTION_API_KEY is required. Add it to .env');
  }
  return new Client({ auth: apiKey });
}

/**
 * Create a page in Notion with the given title and content blocks.
 * @param {import('@notionhq/client').Client} notion
 * @param {object} options
 * @param {string} options.parentType - 'database' | 'page'
 * @param {string} options.parentId - database_id or page_id (UUID)
 * @param {string} options.title - Page title
 * @param {object[]} options.blocks - Notion block objects (from markdownToNotionBlocks)
 * @param {string} [options.titleProperty] - For database: property name for title (default: 'Name' or 'Title')
 * @returns {Promise<{ id: string, url: string }>}
 */
export async function createPage(notion, options) {
  const { parentType, parentId, title, blocks, titleProperty } = options;

  const parent =
    parentType === 'database'
      ? { database_id: parentId.replace(/-/g, '') }
      : { page_id: parentId.replace(/-/g, '') };

  const titleProp = titleProperty || 'Name';
  const titleRichText = [{ type: 'text', text: { content: title, link: null } }];
  const properties =
    parentType === 'database'
      ? { [titleProp]: { title: titleRichText } }
      : { title: { title: titleRichText } };

  const body = {
    parent,
    properties,
    children: blocks,
  };

  const page = await notion.pages.create(body);

  const url = page.url || `https://notion.so/${page.id?.replace(/-/g, '')}`;
  return { id: page.id, url };
}

/**
 * Append blocks to an existing page.
 * @param {import('@notionhq/client').Client} notion
 * @param {string} pageId - Target page ID
 * @param {object[]} blocks - Notion block objects
 */
export async function appendBlocksToPage(notion, pageId, blocks) {
  const cleanId = pageId.replace(/-/g, '');
  await notion.blocks.children.append({
    block_id: cleanId,
    children: blocks,
  });
}
