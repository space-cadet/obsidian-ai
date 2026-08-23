# T48c Semantic Compaction Validation

*Created: 2026-08-23 17:05:26 IST*
*Last Updated: 2026-08-23 17:05:26 IST*
*Task: T48c*
*Implementation: `6a205b9` (PR #5, merged to `main`)*

## Purpose

Validate that the merged Obsidian-AI semantic-compaction slice triggers,
completes asynchronously, shows its user-facing notice, and preserves useful
older conversation state for a later request.

## Settings

- Compaction trigger: `8,000` estimated history tokens
- Compaction release: `4,000` estimated history tokens
- Recent messages preserved: `4`
- Model request budget: `64,000`
- Response reserve: `1,000`
- Active validation profile: DeepSeek v4 Flash

## Procedure

1. Start a fresh chat.
2. Send three long Project Kestrel memo turns containing numbered requirements
   and unique markers.
3. Send a fourth continuation turn after the first three responses.
4. Wait for the notice `Conversation compacted for future requests.`
5. Send a recovery prompt requesting all four markers and representative
   requirements from the earlier turns.

## Observed result

- The first three turns did not trigger compaction because the check runs at
  the beginning of a request and the message-count guard had not yet exceeded
  the four-message preservation tail.
- The fourth turn triggered compaction.
- The chat UI displayed the compaction notice.
- The subsequent recovery response returned all four seeded markers and the
  requested representative requirements, with no item reported unavailable.

## Evidence boundary

The toast is direct evidence that the asynchronous compaction operation
completed. The recovery response is functional evidence that the resulting
model-facing context retained the tested information. The JSON conversation
export does not contain the in-memory summary or the UI notice, so it cannot
independently show the summary contents.

## Follow-up

- Add temporary development diagnostics for compaction completion, source and
  retained-message counts, summary size, and test markers.
- Add schema/provenance and tool-pair validation before treating the summary as
  fully acceptance-complete.
- Add exact historical retrieval and a summary inspection view without
  changing the full transcript/export contract.
