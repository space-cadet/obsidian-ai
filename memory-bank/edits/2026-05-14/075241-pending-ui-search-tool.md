---
kind: edit_chunk
id: 2026-05-14-pending-ui-search-tool
created_at: 2026-05-14 07:52:41 IST
task_ids: [T13]
source_branch: main
source_commit: bbac133362d34a7f81d71b3d5c1d6e425aa69cac
---

#### 07:52:41 IST - T13: Redesign pending tool call UI with summary preview; add search_notes tool
- Modified `src/components/ChatApp.tsx` - Replaced raw `JSON.stringify(pendingToolCall.args)` with `PendingToolCallPreview` component that shows tool-specific summaries: line count, char count, preview excerpt for edits; find/replace rows for patches; heading info for section edits; query for searches. Added `search_notes` mention to system prompt.
- Modified `src/agent/types.ts` - Added `matches`, `count`, `query` optional fields to `ToolResult` interface for search_notes return values
- Modified `src/agent/tools.ts` - Added `searchNotesTool` with Zod schema; included in `noteTools` export
- Modified `src/agent/ToolExecutor.ts` - Added `searchNotes()` handler that filters vault files by basename/path substring match, returns up to 50 matches
- Modified `styles.css` - Added `.pending-tool-summary`, `.pending-tool-title`, `.pending-tool-meta`, `.pending-tool-preview`, `.pending-tool-patch-row/value/label` styles; set `max-height: 280px` and `overflow-y: auto` on `.pending-tool-call`; made Approve/Reject buttons sticky at bottom
