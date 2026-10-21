# Session 2026-10-21 — Agent Prompt Management and Legacy Editor Removal

- **Task:** T75
- **Source branch:** `main`
- **Source commit:** `223bb52d79035dbd70e7e48611a0b3fc4a3c10ce`

## Objective

Expose the complete editable base agent prompt in Settings and through agent
tools, and remove the old selection/cursor tooltip editor while retaining
chat-based note editing.

## Work Completed

- Added `DEFAULT_AGENT_PROMPT` with Obsidian `$...$` inline and `$$...$$`
  display math guidance. Single-agent and group-agent requests share the
  saved `agentPrompt` setting.
- Added the Agent prompt control to Chat Defaults. Its native Obsidian modal
  shows the full base prompt and supports Save, Cancel, and Reset to default.
- Added `get_agent_prompt`, `update_agent_prompt`, and `reset_agent_prompt`.
  Prompt mutations require Developer mode, use the local-write approval path,
  persist settings, and audit prompt length without storing prompt content.
- Removed the legacy tooltip extension, selection/cursor state and settings,
  editor custom prompt commands, prompt-history code, old CSS, and obsolete
  current documentation. The shared note-edit diff remains available from
  Chat Lab with accept/discard command-palette actions.
- Updated the README, contributor guide, package description, and settings
  mockup. Historical task/session records and project ancestry references were
  retained and clarified.

## Verification

- `pnpm run build` passed, including TypeScript and production bundle steps.
- Prettier checks on changed files and `git diff --check` passed.
- Tests and live Obsidian acceptance were not run.
- Changes remain local; no commit or push was made.
