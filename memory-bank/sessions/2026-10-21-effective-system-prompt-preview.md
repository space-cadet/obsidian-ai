# Session 2026-10-21 — Latest Effective System Prompt Preview

- **Task:** T76
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
