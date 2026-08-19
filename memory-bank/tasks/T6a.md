# Task: T6a
*Created: 2026-08-19 13:31:15 IST*
*Last Updated: 2026-08-19 13:31:15 IST*

## Task Information
**Title:** Token Counter Accuracy Fix — Full Request Payload Counting
**Status:** 🔄 ACTIVE
**Priority:** HIGH
**Created:** 2026-08-19 13:31:15 IST
**Started:** Not started

## Description

The current token counter in the plugin UI significantly undercounts the actual
API request size. It only counts the current user message plus attached context
items, but the full API payload includes:

1. The system prompt (`buildSystemPrompt`) — persona, tools, system context
2. Full conversation history (up to `maxContextMessages`, default 10)
3. Previous tool calls and tool results
4. Message structure overhead

This leads to a disconnect between what the user sees and what they are actually
billed for — especially with DeepSeek's cache hit/miss pricing where the plugin
shows a fraction of the real token count.

## Acceptance Criteria

- [ ] Token counter includes system prompt tokens in the estimate
- [ ] Token counter includes conversation history tokens in the estimate
- [ ] Settings toggle: "Show full request tokens" vs "Show message-only tokens"
- [ ] When "full request tokens" is enabled, the UI shows the complete payload estimate
- [ ] Default behavior is "full request tokens" (honest by default)
- [ ] Existing `userMsg.estimatedTokens` is preserved for backward compatibility
- [ ] The counter works correctly for all providers (OpenAI, DeepSeek, Anthropic, etc.)

## Implementation Details

- In `useMessageActions.ts`, after building `chatMessages` array (system + history + user),
  run `estimateTokens(JSON.stringify(chatMessages))` to get the full payload count
- Add a new setting `showFullRequestTokens: boolean` (default `true`)
- In the token counter UI component, use the full count when enabled
- Consider adding a breakdown: "~850K total (842K cached, 8K new)" for providers that report it
- The `TOKEN_ESTIMATE_RATIO = 4` heuristic remains the same; this is about *what* gets counted, not *how*

## Related Files

- `src/hooks/useMessageActions.ts` — where `chatMessages` array is built and where `userTokenEstimate` is computed
- `src/context/tokenEstimator.ts` — `estimateTokens()` function
- `src/settings.ts` — add `showFullRequestTokens` setting
- `src/components/ChatApp.tsx` or token counter UI component

## Dependencies

- **Depends On:** T6 (Token & Context Management — completed foundation)
- **Blocks:** None directly, but T48 (Compaction) benefits from accurate counting

## Progress Tracking

- 2026-08-19 13:31:15 IST: Task created from token cost investigation with DeepSeek V4 pricing

## Issues and Blockers

- None currently

## Notes

- DeepSeek V4 pricing investigation revealed the discrepancy: plugin showed ~8K tokens
  while DeepSeek billed for ~850K tokens (842K cache hit, 8K new). The plugin's
  `estimateTokens()` only counted the user message text, not the system prompt or
  conversation history that gets sent in every request.
- This is a 20-line fix with immediate user impact for cost transparency.
