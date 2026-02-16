/**
 * PR summarization via Gemini.
 * Produces a structured summary for each LLM package.
 */

import { GoogleGenAI } from '@google/genai';

const SUMMARY_PROMPT = `You are summarizing a merged GitHub Pull Request for a developer's personal "PR memory" / interview prep.

Given the PR data below, produce a concise summary with exactly these 6 sections. Use markdown bullets where helpful. Be specific and technical.

Each comment may include a hunkRef pointing to a shared diff hunk (e.g. hunk_1). Use the diffHunks section to resolve these when interpreting what the comment refers to.

Output format (use these exact headings):

- **Problem / why the change was needed**
- **My key changes**
- **Approach / architecture decisions**
- **Any tricky bits**
- **What reviewers commented on**
- **One-sentence "interview snippet"**

PR data:
`;

/**
 * Initialize the Gemini client.
 * Uses GEMINI_API_KEY or GOOGLE_API_KEY for AI Studio, or Vertex AI when configured.
 * @returns {GoogleGenAI}
 */
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    return new GoogleGenAI({ apiKey });
  }
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' || project;
  if (useVertex && project) {
    return new GoogleGenAI({
      vertexai: true,
      project,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    });
  }
  throw new Error(
    'Add to .env: GEMINI_API_KEY (from https://aistudio.google.com/apikey) OR GOOGLE_CLOUD_PROJECT=your-project (Vertex AI + gcloud auth application-default login)'
  );
}

/**
 * Summarize an LLM package using Gemini.
 * @param {object} llmPackage - The LLM package JSON (from generateLLMPackage)
 * @param {object} [options]
 * @param {string} [options.model] - Gemini model (default: gemini-2.0-flash)
 * @returns {Promise<string>} The summary text (markdown)
 */
export async function summarizePR(llmPackage, options = {}) {
  const client = getClient();
  const model = options.model || 'gemini-2.0-flash';

  const input = SUMMARY_PROMPT + '\n```json\n' + JSON.stringify(llmPackage, null, 2) + '\n```';

  const response = await client.models.generateContent({
    model,
    contents: input,
  });

  return response.text ?? '';
}
