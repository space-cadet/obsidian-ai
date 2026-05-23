---
kind: edit_chunk
id: 2026-05-23-2354-t13-context-fixes
created_at: 2026-05-23 23:54:00 IST
task_ids: [T13]
source_branch: main
source_commit: d19de84
---

#### 23:54:00 IST - T13: Fixed folder context overload, enhanced list_notes, fixed count_notes accuracy
- Modified `src/context/ContextEngine.ts` - Folder and tag context items now return file listings with tool-usage instructions instead of reading full file contents. Prevents token bloat when large folders are attached as context.
- Modified `src/agent/tools.ts` - Added `include_subfolders` (boolean, default true) and `depth` (number, default 1, max 3) parameters to `list_notes` tool definition
- Modified `src/agent/ToolExecutor.ts` - `listNotes()` now returns `subfolders` array alongside `files`; `countNotes()` reports 5-count breakdown (totalCount, markdownCount, directCount, directMarkdownCount, subfolderCount)
- Modified `src/components/ChatApp.tsx` - `buildSystemPrompt()` now describes enhanced `list_notes` and `count_notes` capabilities to the LLM
