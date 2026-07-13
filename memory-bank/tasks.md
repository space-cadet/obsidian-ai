# Task Registry
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-06-15 00:19 IST*

## Summary
- Active: **7** | Paused: 1 | Completed: **14** | Cancelled: 0

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
| T13 | Agentic Tool Calling for Note Editing | ✅ | HIGH | 2026-05-06 | T1, T3, T5, T9 | [Details](tasks/T13.md) |
| T14 | Remote Agent Connectivity (OpenResponses) | 🔄 | HIGH | 2026-05-07 | T1, T5, T9, T13 | [Details](tasks/T14.md) |
| T15 | Tabbed Chat Interface with Multi-Profile | 🔄 | HIGH | 2026-05-15 | T9, T13, T14 | [Details](tasks/T15.md) |
| T16 | Group Chat (Multi-Agent Conversation) | 🔄 | HIGH | 2026-05-16 | T15 | [Details](tasks/T16.md) |
| T17 | Advanced Vault Tools — Backlinks, YAML, Bulk Ops | ⏸️ | HIGH | — | T13 | [Details](tasks/T17.md) |
| T18 | Web Search Tool for Chat | ✅ | MEDIUM | 2026-05-16 | T13, T9 | [Details](tasks/T18.md) |
| T19 | File Attachments for Chat Messages | ✅ | HIGH | 2026-05-25 | T13, T4, T9 | [Details](tasks/T19.md) |
| T21 | CLI Test Harness for AI Features | ✅ | MEDIUM | 2026-05-25 | T19, T4, T13 | [Details](tasks/T21.md) |
| **T22** | **ChatApp.tsx Component Decomposition** | 🔄 | **HIGH** | **2026-05-28** | — | **[Details](tasks/T22.md)** |
| T23 | Settings.ts Decomposition | ✅ | HIGH | 2026-05-28 | — | [Details](tasks/T23.md) |
| **T24** | **SessionStorage — JSONL Chat Persistence** | ✅ | **HIGH** | **2026-06-14** | — | **[Details](tasks/T24.md)** |
| **T25** | **Unit Test Infrastructure for Streaming & Token Estimation** | ⏸️ | **MEDIUM** | **—** | **T21, T4, T6** | **[Details](tasks/T25.md)** |

## Active Tasks

### META-1: Memory Bank Setup and Maintenance
**Status:** 🔄 IN PROGRESS | **Priority:** HIGH | **Started:** 2026-05-02
- Memory bank structure created and maintained
- T1–T19 task files created and kept in sync
- Format normalization complete

### T8 — Open Source Release with Branding *(requires T7)*
Branding transition and open-source release preparation. See `tasks/T8.md`.

### T11 — Debug Logging & Diagnostics *(requires T9)*
File-based debug logger, React ErrorBoundary, diagnostics panel in Settings, and the newer debug-log spam diagnosis plus persistence queue/debounce fix. See `tasks/T11.md`.

### T14 — Remote Agent Connectivity (OpenResponses) *(requires T1, T5, T9, T13)*
Connect Obsidian chat to remote OpenClaw agents via OpenResponses API. Phase 3 in progress. See `tasks/T14.md`.

### T15 — Tabbed Chat Interface with Multi-Profile *(requires T9, T13, T14)*
Multi-panel, multi-provider chat interface. Phases 1–2 complete. Phase 3 (TabBar UI) pending. See `tasks/T15.md`.

### T16 — Group Chat (Multi-Agent Conversation) *(requires T15)*
Multi-agent group chat with mention-based routing, orchestration, and shared context. MVP implemented. User confirmed working. **May 25: Fixed duplicate profile ID on copy (commit `de84c4a`) and model fetching for all providers (commit `9d3d1a3`). Added thinking display toggle. May 28: Wired thinkingEnabled to LLM calls, fixed model picker to use selected profile (commits `2d4e53c`, `6e96212`).** See `tasks/T16.md`.

### T19 — File Attachments for Chat Messages *(requires T13, T4, T9)*
Enable users to attach markdown files, images, and PDFs to chat messages so the LLM can consume their content. Multimodal support via Vercel AI SDK v6 `ImagePart`/`FilePart`. Core implementation complete (commit `a071a24`). Build passes. Group chat broadcasting deferred. See `tasks/T19.md`.

## Pending Tasks (v2.0 Development)

### T12 — Chat Onboarding, Tips & Empty States *(requires T1, T9)*
Empty states, setup warnings, contextual tips, first-run guidance. See `tasks/T12.md`.

### T17 — Advanced Vault Tools — Backlinks, YAML, Bulk Ops *(requires T13)*
Networked thought tools (backlinks, outlinks, unlinked mentions), YAML frontmatter management, tag operations, bulk reorganization, templating, and vault maintenance (broken links, orphans). User-prioritized: backlinks + YAML first. See `tasks/T17.md`.

### T25 — Unit Test Infrastructure for Streaming & Token Estimation *(requires T21, T4, T6)*
Unit test coverage for streaming state accumulation, token estimation, and message rendering. Extract pure functions from `AgentLoop.ts`, `OpenResponsesLoop.ts`, `useMessageActions.ts`, and `ChatMessages.tsx`. Create mock-based tests for streaming loops. Deferred until after release cycle. See `tasks/T25.md`.

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
| T13 | Agentic Tool Calling for Note Editing | 2026-05-14 | T1, T3, T5, T9 | [Details](tasks/T13.md) |
| T18 | Web Search Tool for Chat | 2026-05-16 | T13, T9 | [Details](tasks/T18.md) |
| T21 | CLI Test Harness for AI Features | 2026-05-29 | T19, T4, T13 | [Details](tasks/T21.md) |
| T22 | ChatApp.tsx Component Decomposition | 2026-05-29 | — | [Details](tasks/T22.md) |
| T23 | Settings.ts Decomposition | 2026-05-29 | — | [Details](tasks/T23.md) |
| T24 | SessionStorage — JSONL Chat Persistence | 2026-06-14 | — | [Details](tasks/T24.md) |

### T24 — SessionStorage — JSONL Chat Persistence *(no dependencies)*
Persistent chat session storage using JSONL format. Core SessionStorage class, ChatStorage async wrapper, migration utilities, and plugin integration. 17 files changed, 1138 insertions. Build passes. See `tasks/T24.md`.
Break down the 1,948-line `ChatApp.tsx` into focused hooks and sub-components. **Complete**: Phases 0–3 done. Extracted 6 utility modules, `useChatSession`, `useChatUI`, and `useMessageActions` with 52 passing tests. ChatApp.tsx reduced from 1,948 → 636 lines (-67%). See `tasks/T22.md`.

### T21 — CLI Test Harness *(requires T19, T4, T13)*
Standalone CLI test scripts for exercising AI features without Obsidian runtime. Tests attachment resolution, streaming, tool calling, and multimodal APIs. Task created. See `tasks/T21.md`.

## Cancelled / Paused Tasks

*T11 moved from ⏸️ PAUSED to 🔄 IN PROGRESS on 2026-05-08. T12 remains paused. T17 remains paused.*
