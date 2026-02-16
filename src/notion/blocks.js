/**
 * Convert markdown summary to Notion block format.
 * Notion rich text limit: 2000 chars per text object.
 */

const RICH_TEXT_LIMIT = 2000;

function richText(content, bold = false) {
  const chunks = [];
  let remaining = content;
  while (remaining.length > 0) {
    const chunk = remaining.slice(0, RICH_TEXT_LIMIT);
    remaining = remaining.slice(RICH_TEXT_LIMIT);
    chunks.push({
      type: 'text',
      text: { content: chunk, link: null },
      annotations: { bold, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
    });
  }
  return chunks;
}

function block(type, content, bold = false) {
  const rt = richText(content, bold);
  return { object: 'block', type, [type]: { rich_text: rt } };
}

/**
 * Parse summary markdown into Notion blocks.
 * Handles: **Heading**, * bullet, plain paragraph.
 * @param {string} markdown
 * @returns {object[]} Notion block objects
 */
export function markdownToNotionBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // - **Heading** or **Heading** at start -> heading_2
    const headingMatch = trimmed.match(/^(?:-\s*)?\*\*(.+?)\*\*\s*$/);
    if (headingMatch) {
      blocks.push(block('heading_2', headingMatch[1], false));
      continue;
    }

    // * or "  *" bullet -> bulleted_list_item
    const bulletMatch = trimmed.match(/^\*+\s*(.+)$/);
    if (bulletMatch) {
      blocks.push(block('bulleted_list_item', bulletMatch[1], false));
      continue;
    }

    // Plain paragraph
    blocks.push(block('paragraph', trimmed, false));
  }

  return blocks;
}
