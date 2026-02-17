# CodeDiary

Fetch your **merged** PRs from GitHub, summarize with Gemini, and write directly to Notion. 

## Tech stack

- **Backend:** Node.js (CLI)
- **GitHub API:** `@octokit/rest` (PRs, diffs, comments)
- **Auth:** GitHub OAuth

## Setup

1. **Clone and install**

   ```bash
   git clone <repo-url>
   cd <project-folder>   # e.g. CodeDiary or whatever the repo is cloned as
   npm install
   ```

2. **GitHub auth** – choose one:

   - **PAT (no browser):** Add `GITHUB_TOKEN=ghp_xxx` to `.env` ([create token](https://github.com/settings/tokens), scope: `read:user`, `repo`)
   - **OAuth device flow:** Add `GITHUB_CLIENT_ID` to `.env`. Create an OAuth app at [GitHub Developer Settings](https://github.com/settings/developers) and enable **Device flow**. On first run, sync opens the GitHub login page; enter the code shown in the terminal.

3. **Environment**

   Copy `.env.example` to `.env` and set credentials from step 2.

## Workflow

One command: fetch PRs, summarize with Gemini, write to Notion.

```bash
npm run sync                    # or: npm start
npm run sync -- --force         # bypass cache, append all PRs again
npm run sync -- --limit 10      # summarize top 10 (most recently updated) PRs only
```

- **If `GITHUB_TOKEN` in .env:** uses it, no browser
- **Else:** device flow — opens GitHub login page, enter the code, saves token to `.github-token`
- **PR limit:** interactive prompt, or `--limit N` / `PR_LIMIT=N` env var

Requires: `NOTION_API_KEY`, `NOTION_PAGE_ID`, `GEMINI_API_KEY`.

## Project layout

- **`src/scripts/sync.js`** – One command: login (if needed) → fetch → summarize → Notion.
- **`src/auth/github-oauth.js`** – OAuth device flow (no localhost).
- **`src/github/pr-fetcher.js`** – Fetch PRs, enrich with diff and review comments.
- **`src/services/pr-summarizer.js`** – Summarize via Gemini.
- **`src/notion/`** – Notion API client and page creation.

## Notion setup

**Setup:** Create an [integration](https://www.notion.so/my-integrations), share a page with it, add to `.env`:

```env
NOTION_API_KEY=secret_xxx
NOTION_PAGE_ID=xxx   # page to append all PR summaries to
```

**Cache:** `notion-sync-cache.json` tracks which PRs have been appended. Use `--force` to append all PRs again.

## Future contributions

Ideas for enhancements:

- **Repo selector** – Checklist of your repositories so you can choose which ones to fetch instead of pulling everything (helps avoid API rate limits).
- **Date range picker** – Filter PRs by time window, e.g. "last 3 months" or custom range.
- **Prompt tuner** – Edit the Gemini system prompt before running summaries (e.g. "Make summaries sound like a Senior Architect").
