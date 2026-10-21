# Session 2026-10-21 — Latest Effective System Prompt Preview

- **Task:** T75a, subtask of T75 (originally recorded as T76)
- **Source branch:** `codex/t75-agent-prompt-editor`
- **Base commit:** `59c26b114602ecf6e229f54e8c100ef3b8ae1c64`

## Objective

Expose the generated prompt that users could not see through the T75 base
prompt editor.

## Work Completed

- Added a read-only, copyable latest system prompt view to the existing Agent
  prompt modal.
- Captured the final single-agent system message after runtime tool guidance
  is added, and each composed system message in group chat.
- Labeled the snapshot with the relevant profile or group participant and
  model. Kept it in memory until reload.
- Preserved any unsaved base-prompt draft while switching between modal views.
- Clarified that note and attachment bodies are separate message context and
  are not part of the system prompt.

## Verification

- Production build, changed-file Prettier checks, and `git diff --check` passed.
- Tests and live Obsidian UI acceptance were not run.

## Agent-Tool Access Follow-up — 2026-10-21

- Commit `7ebb999` extended `get_agent_prompt` to return both the shared base
  prompt and the latest captured effective system prompt, including its
  content, label, and capture time. The tool wiring covers single-agent,
  group-agent, and approval fallback paths.
- The user confirmed the Settings preview and agent-tool access work. The
  production build, Prettier checks, and `git diff --check` passed; automated
  tests were not run.
- The preview and tool-access work is consolidated as subtask T75a under T75.
  The original T76 edit chunk is retained as historical provenance. No safe
  Markdown edit-history generator is available for the text-primary bank.
