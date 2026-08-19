# Task: T6a
*Created: 2026-08-19 13:31:15 IST*
*Last Updated: 2026-08-19 17:50 IST*

## Task Information
**Title:** Token Counter Accuracy Fix — Full Request Payload Counting
**Status:** ✅ COMPLETE
**Priority:** HIGH
**Created:** 2026-08-19 13:31:15 IST
**Started:** 2026-08-19
**Completed:** 2026-08-19
**Commit:** `161fee3`

## Description

The current token counter in the plugin UI significantly undercounts the actual
API request size. It only counts the current user message plus attached context
items, but the full API payload includes:

1. The system prompt (`buildSystemPrompt`) — persona, tools, system context
2. Full conversation history (up to `maxContextMessages`, default 10)
3. Previous tool calls and tool results
4. Message structure overhead

This leads to a disconnect between what the user sees and what they are actually
being charged for (especially on providers like DeepSeek where cache pricing
matters).

## Implementation

### Files Modified
- `src/settings.ts` — Added `showFullRequestTokens: boolean` (default `true`)
- `src/settings-sections/chatDefaults.ts` — Added toggle UI in Chat Defaults
- `src/hooks/useMessageActions.ts` — Computes `fullPayloadTokenEstimate = estimateTokens(JSON.stringify(chatMessages))` when enabled
- `src/components/ChatApp.tsx` — Displays correct total without double-counting

### Behavior
- **Enabled (default):** Token counter shows complete API request payload = system prompt + conversation history + current message + assistant response
- **Disabled:** Token counter shows only the current message tokens

### Limitations
- Full payload count only works for active/new messages (while streaming)
- For loaded older sessions, only individual message token sums are displayed (system prompt not included in saved session data)

## Acceptance Criteria
- [x] Full payload token count computed and displayed
- [x] Settings toggle to switch between full payload and message-only
- [x] Default: full payload enabled
- [x] No double-counting when full mode is on
- [x] Backward compatible (toggle allows old behavior)

## Related
- T48: Conversation Compaction Mechanism (future — will reduce payload size)
