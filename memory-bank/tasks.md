# Task Registry
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 23:56:30 IST*

## Summary
- Active: 4 | Paused: 3 | Completed: 5 | Cancelled: 0

## Task Registry Table

| ID | Title | Status | Priority | Started | Dependencies | Details |
|----|-------|--------|----------|---------|--------------|---------|
| META-1 | Memory Bank Setup and Maintenance | 🔄 | HIGH | 2026-05-02 | — | [Details](tasks/META-1.md) |
| T1 | Chat Panel — ItemView + React UI | ✅ | HIGH | 2026-05-02 | T4, T9 | [Details](tasks/T1.md) |
| T2 | Conversation Chain & Memory | 🔄 | HIGH | 2026-05-02 | T1 | [Details](tasks/T2.md) |
| T3 | Context & Mentions System | 🔄 | HIGH | 2026-05-02 | T1 | [Details](tasks/T3.md) |
| T4 | Streaming | ✅ | HIGH | 2026-05-02 | T9 | [Details](tasks/T4.md) |
| T5 | In-Place Note Editing from Chat | 🔄 | HIGH | 2026-05-02 | T1 | [Details](tasks/T5.md) |
| T6 | Token & Context Management | ⬜ | MEDIUM | — | T1, T2 | [Details](tasks/T6.md) |
| T7 | Release System & CI/CD | ✅ | HIGH | 2026-05-02 | — | [Details](tasks/T7.md) |
| T8 | Open Source Release with Branding | 🔄 | HIGH | 2026-05-02 | T7 | [Details](tasks/T8.md) |
| T9 | Settings & Provider Profiles | ✅ | HIGH | 2026-05-02 | T1 | [Details](tasks/T9.md) |
| T10 | Model Discovery & Picker UX | ⏸️ | HIGH | — | T9 | [Details](tasks/T10.md) |
| T11 | Debug Logging & Diagnostics | ⏸️ | MEDIUM | — | T9 | [Details](tasks/T11.md) |
| T12 | Chat Onboarding, Tips & Empty States | ⏸️ | MEDIUM | — | T1, T9 | [Details](tasks/T12.md) |

## Active Tasks

### META-1: Memory Bank Setup and Maintenance
**Status:** 🔄 IN PROGRESS | **Priority:** HIGH | **Started:** 2026-05-02
- Memory bank structure created and maintained
- T1–T12 task files created and kept in sync
- Format normalization complete

### T3 — Context & Mentions System *(requires T1)*
Active note toggle implemented: `includeActiveNote` state in ChatApp, chip in ContextBar, XML context block injected into user message on send. Next: `@`mention autocomplete + ContextEngine. See `tasks/T3.md`.

### T2 — Conversation Chain & Memory *(requires T1)*
Basic single-session persistence done: messages saved/loaded via plugin.loadChatMessages/saveChatMessages. Full ConversationManager, multi-conversation UI pending. See `tasks/T2.md`.

### T5 — In-Place Note Editing *(requires T1)*
`NoteEditingBridge` refactored: receives resolved view/file from caller. Correct note always targeted via workspace active-leaf-change tracking in ChatApp. Button labels show target note name. Remaining: target-note by path (needs T3), slash commands, retry button. See `tasks/T5.md`.

### T8 — Open Source Release with Branding *(requires T7)*
Branding transition and open-source release preparation. See `tasks/T8.md`.

## Pending Tasks (v2.0 Development)

### T3 — Context & Mentions System *(requires T1)*
`@mention` vault note injection, embed expansion, active note toggle. See `tasks/T3.md`.

### T6 — Token & Context Management *(requires T1, T2)*
Token estimation, history truncation, context usage indicator. See `tasks/T6.md`.

### T10 — Model Discovery & Picker UX *(requires T9)*
Provider-aware model discovery, cache metadata, refresh/error states, searchable picker. See `tasks/T10.md`.

### T11 — Debug Logging & Diagnostics *(requires T9)*
Structured diagnostics with privacy redaction and bounded retention. See `tasks/T11.md`.

### T12 — Chat Onboarding, Tips & Empty States *(requires T1, T9)*
Empty states, setup warnings, contextual tips, first-run guidance. See `tasks/T12.md`.

## Completed Tasks

| ID | Title | Completed | Related Tasks | Archive |
|----|-------|-----------|---------------|---------|
| T1 | Chat Panel — ItemView + React UI | 2026-05-02 | T2, T3, T4, T5, T6 | [Details](tasks/T1.md) |
| T4 | Streaming | 2026-05-02 | T9 | [Details](tasks/T4.md) |
| T7 | Release System & CI/CD | 2026-05-02 | — | [Details](tasks/T7.md) |
| T9 | Settings & Provider Profiles | 2026-05-02 | T4, T10, T11 | [Details](tasks/T9.md) |

## Cancelled / Paused Tasks

*None cancelled. T10, T11, T12 are paused pending T3 context work.*
