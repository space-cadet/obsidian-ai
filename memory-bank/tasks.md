# Task Registry
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 08:13:57 IST*

## Summary
- Active: 1 | Paused: 0 | Completed: 0 | Cancelled: 0

## Task Registry Table

| ID | Title | Status | Priority | Started | Dependencies | Details |
|----|-------|--------|----------|---------|--------------|---------|
| META-1 | Memory Bank Setup and Maintenance | 🔄 | HIGH | 2026-05-02 | — | tasks/META-1.md |
| T1 | Chat Panel — ItemView + React UI | ⬜ | HIGH | — | T4 | tasks/T1.md |
| T2 | Conversation Chain & Memory | ⬜ | HIGH | — | T1 | tasks/T2.md |
| T3 | Context & Mentions System | ⬜ | HIGH | — | T1 | tasks/T3.md |
| T4 | Streaming | ⬜ | HIGH | — | — | tasks/T4.md |
| T5 | In-Place Note Editing from Chat | ⬜ | HIGH | — | T1, T2, T3 | tasks/T5.md |
| T6 | Token & Context Management | ⬜ | MEDIUM | — | T1, T2 | tasks/T6.md |

## Active Tasks

### META-1: Memory Bank Setup and Maintenance
**Status:** 🔄 IN PROGRESS | **Priority:** HIGH | **Started:** 2026-05-02
- Architecture analysis complete (current + proposed)
- Task files T1–T6 created
- Implementation detail docs created
- integrated-rules-v6.12.md saved to memory-bank/
- Core memory bank files updated

## Pending Tasks (v2.0 Development)

### T4 — Streaming *(start first — no dependencies)*
Add `streamChat()` to `ChatApiManager` using LangChain `.stream()`. No other tasks blocked on this. See `tasks/T4.md`.

### T1 — Chat Panel *(blocks T2, T3, T5, T6)*
Obsidian `ItemView` + React UI for persistent sidebar chat. See `tasks/T1.md`.

### T2 — Conversation Chain & Memory *(requires T1)*
Multi-turn conversation state, LangChain message history, persistence. See `tasks/T2.md`.

### T3 — Context & Mentions System *(requires T1)*
`@mention` vault note injection, embed expansion, active note toggle. See `tasks/T3.md`.

### T5 — In-Place Note Editing from Chat *(requires T1, T2, T3)*
`NoteEditingBridge` connects chat → editor diff machinery. See `tasks/T5.md`.

### T6 — Token & Context Management *(requires T1, T2)*
Token estimation, history truncation, context usage indicator. See `tasks/T6.md`.

## Completed Tasks

*None yet.*

## Cancelled / Paused Tasks

*None.*
