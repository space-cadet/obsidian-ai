# Task Registry
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-12 11:13:59 IST*

## Summary
- Active: 4 | Paused: 1 | Completed: 9 | Cancelled: 0

## Task Registry Table

| ID | Title | Status | Priority | Started | Dependencies | Details |
|----|-------|--------|----------|---------|--------------|---------|
| META-1 | Memory Bank Setup and Maintenance | 🔄 | HIGH | 2026-05-02 | — | [Details](tasks/META-1.md) |
| T1 | Chat Panel — ItemView + React UI | ✅ | HIGH | 2026-05-02 | T4, T9 | [Details](tasks/T1.md) |
| T2 | Conversation Chain & Memory | ✅ | HIGH | 2026-05-02 | T1 | [Details](tasks/T2.md) |
| T3 | Context & Mentions System | ✅ | HIGH | 2026-05-02 | T1 | [Details](tasks/T3.md) |
| T4 | Streaming | ✅ | HIGH | 2026-05-02 | T9 | [Details](tasks/T4.md) |
| T5 | In-Place Note Editing from Chat | ✅ | HIGH | 2026-05-02 | T1 | [Details](tasks/T5.md) |
| T6 | Token & Context Management | ✅ | MEDIUM | 2026-05-02 | T1, T2 | [Details](tasks/T6.md) |
| T7 | Release System & CI/CD | ✅ | HIGH | 2026-05-02 | — | [Details](tasks/T7.md) |
| T8 | Open Source Release with Branding | 🔄 | HIGH | 2026-05-02 | T7 | [Details](tasks/T8.md) |
| T9 | Settings & Provider Profiles | ✅ | HIGH | 2026-05-02 | T1 | [Details](tasks/T9.md) |
| T10 | Model Discovery & Picker UX | ✅ | HIGH | 2026-05-02 | T9 | [Details](tasks/T10.md) |
| T11 | Debug Logging & Diagnostics | 🔄 | MEDIUM | 2026-05-08 | T9 | [Details](tasks/T11.md) |
| T12 | Chat Onboarding, Tips & Empty States | ⏸️ | MEDIUM | — | T1, T9 | [Details](tasks/T12.md) |
| T13 | Agentic Tool Calling for Note Editing | 🔄 | HIGH | 2026-05-06 | T1, T3, T5, T9 | [Details](tasks/T13.md) |
| T14 | Remote Agent Connectivity (OpenResponses) | 🔄 | HIGH | 2026-05-07 | T1, T5, T9, T13 | [Details](tasks/T14.md) |

## Active Tasks

### META-1: Memory Bank Setup and Maintenance
**Status:** 🔄 IN PROGRESS | **Priority:** HIGH | **Started:** 2026-05-02
- Memory bank structure created and maintained
- T1–T14 task files created and kept in sync
- Format normalization complete

### T8 — Open Source Release with Branding *(requires T7)*
Branding transition and open-source release preparation. See `tasks/T8.md`.

### T11 — Debug Logging & Diagnostics *(requires T9)*
File-based debug logger, React ErrorBoundary, diagnostics panel in Settings, and the newer debug-log spam diagnosis plus persistence queue/debounce fix. See `tasks/T11.md`.

### T13 — Agentic Tool Calling for Note Editing *(requires T1, T3, T5, T9)*
Advanced AI tool calling for note editing. `resolveNote()`, `patch_note`, `edit_section` implemented. Crash debugging in progress. See `tasks/T13.md`.

### T14 — Remote Agent Connectivity (OpenResponses) *(requires T1, T5, T9, T13)*
Connect Obsidian chat to remote OpenClaw agents via OpenResponses API. See `tasks/T14.md`.

## Pending Tasks (v2.0 Development)

### T12 — Chat Onboarding, Tips & Empty States *(requires T1, T9)*
Empty states, setup warnings, contextual tips, first-run guidance. See `tasks/T12.md`.

## Completed Tasks

| ID | Title | Completed | Related Tasks | Archive |
|----|-------|-----------|---------------|---------|
| T1 | Chat Panel — ItemView + React UI | 2026-05-02 | T2, T3, T4, T5, T6 | [Details](tasks/T1.md) |
| T2 | Conversation Chain & Memory | 2026-05-04 | T1 | [Details](tasks/T2.md) |
| T3 | Context & Mentions System | 2026-05-04 | T1 | [Details](tasks/T3.md) |
| T4 | Streaming | 2026-05-02 | T9 | [Details](tasks/T4.md) |
| T5 | In-Place Note Editing from Chat | 2026-05-04 | T1 | [Details](tasks/T5.md) |
| T6 | Token & Context Management | 2026-05-04 | T1, T2 | [Details](tasks/T6.md) |
| T7 | Release System & CI/CD | 2026-05-02 | — | [Details](tasks/T7.md) |
| T9 | Settings & Provider Profiles | 2026-05-02 | T4, T10, T11 | [Details](tasks/T9.md) |
| T10 | Model Discovery & Picker UX | 2026-05-04 | T9 | [Details](tasks/T10.md) |

## Cancelled / Paused Tasks

*T11 moved from ⏸️ PAUSED to 🔄 IN PROGRESS on 2026-05-08. T12 remains paused.*
