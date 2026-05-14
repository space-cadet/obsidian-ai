---
task: T13
branch: main
commit: c2307b6
---

# 2026-05-14 09:19–09:51 — T13: Vault Management Tools, AgentLoop, PendingToolCard, Tool Formatting

## Summary

Completed all remaining T13 Phase 2/3 items plus a critical gap identified by the user: the AI lacked vault management tools (create folders, move notes, delete notes, list folders). Four commits, all building cleanly.

## Changes

### Commit 1: e0869b1 — Vault Management Tools
- **src/agent/tools.ts**: Added `createFolderTool`, `moveNoteTool`, `deleteNoteTool`, `listFoldersTool` (Zod schemas + descriptions)
- **src/agent/ToolExecutor.ts**: Added `createFolder()`, `moveNote()`, `deleteNote()`, `listFolders()` implementations
  - `moveNote` auto-creates parent folders via `vault.createFolder()`
  - `deleteNote` uses `vault.trash(file, false)` → system trash
  - `listFolders` builds folder tree from `vault.getAllLoadedFiles()`
- **src/agent/types.ts**: Added `oldPath`, `folders`, `parent` to `ToolResult`
- **src/components/ChatApp.tsx**: Added pending tool preview cases for all 4 new tools
- **System prompt**: Updated to list all 13 tools by name with usage guidance

### Commit 2: e2d727d — AgentLoop Extraction
- **src/agent/AgentLoop.ts** (new): Extracted inline tool loop from ChatApp into dedicated class
  - `AgentLoopOptions` interface with `chatApi`, `toolExecutor`, `maxSteps`, `autoApprove`, `onTextDelta`, `onToolCall`, `requestApproval`
  - `run()` method: stream → detect tool → execute/approve → format result → repeat
  - AbortSignal propagation for clean cancellation
  - Logs each step for debugging
- **src/components/ChatApp.tsx**: Replaced ~70 lines of inline loop with `new AgentLoop({...}).run()`

### Commit 3: dcee512 — PendingToolCard Component
- **src/components/PendingToolCard.tsx** (new): Extracted `PendingToolCallPreview` + approval buttons
  - All 13 tool preview summaries in one component
  - Summarizes content with line count, preview excerpt, patch rows
- **src/components/ChatApp.tsx**: Removed inline `PendingToolCallPreview` function; renders `<PendingToolCard />` instead

### Commit 4: c2307b6 — Tool Result Formatting
- **src/agent/AgentLoop.ts**: Added `formatToolResult()` function
  - `search_notes` / `list_notes` → markdown tables with `[[wiki-links]]`
  - `list_folders` → bulleted list
  - `get_note_metadata` → formatted summary (size, dates, word count)
  - `read_note` → clean content (no JSON wrapper)
  - Edit/create/move/delete/folder → simple success text
  - Passed as `type: "text"` to LLM instead of raw `type: "json"` blobs
  - Prevents LLM from dumping raw JSON in chat responses

## Build Status
All 4 commits: `tsc -noEmit -skipLibCheck && esbuild.config.mjs production` — clean.

## Files Changed
- `src/agent/tools.ts`
- `src/agent/ToolExecutor.ts`
- `src/agent/types.ts`
- `src/agent/AgentLoop.ts` (new)
- `src/components/ChatApp.tsx`
- `src/components/PendingToolCard.tsx` (new)
