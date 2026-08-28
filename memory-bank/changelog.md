# Changelog

All notable changes to this project will be documented in this file.

## [1.4.1] - 2026-08-28

### Community Review Compliance
- Fixed `no-unsupported-api` errors: replaced `app.loadLocalStorage/saveLocalStorage` with browser `localStorage` + namespace (SyncLogger.ts, storage.ts)
- Fixed `no-static-styles-assignment` errors: refactored ~49 inline style assignments to CSS classes (SyncProgressModal.ts, syncComponents.ts, remoteStorageSettings.ts)
- Added `.is-hidden` utility class for dynamic visibility toggling
- Corrected release tag from `v1.4.1` to `1.4.1` to match manifest version (Obsidian requires exact match)

## [1.4.0] - 2026-08-28

### Architecture
- **T46/T46a — Orchestration Decomposition**: Extracted `TurnLifecycle` from `useMessageActions.ts` (1,300+ line hook → modular coordinator). Split tool handlers by domain (note, bulk, discovery, vault, web, memory, session, settings). Added `ChatTurnRequest`, `ChatTurnOutput`, `ChatTurnPersistence` for React-independent turn processing. (PR #7, `975bb7e`)
- Merged `api.ts` and `main.ts` into modular files.

### Context Efficiency
- **T48 — Token Budgeting**: Budgeted model context with bounded tool-result replay. Semantic conversation compaction (`8000/4000` trigger, four recent messages preserved). (PR #5, `6a205b9`)
- **T64 — Benchmark Harness**: Live API mode with OpenRouter, Kimi, Kimi-custom providers. `maxContextMessages: 10` → **42% token reduction**. Auto-preserve for agent mode supported by data.
- **T62 — Tool Payload Elision**: Elide tool results in history replay (⚠️ regression in agent mode — workaround: `toolHistoryMode: "preserve"`)

### Tool System
- **T60 — Tool Hardening**: Canonical tool registry adapter + execution wiring. Registry is now sole dispatch source. Added `search_note_content` tool. Hardened validation (provider JSON schemas, integer inputs, search limits). Bounded result pagination (cursors for searches, memory, web results, PDF ranges).
- **T60b — OpenResponses Loop Fix**: Stateful continuations, ~140× token reduction (500K → 3.6K).

### Sync & Storage
- **T43/T58 — Sync System**: Rich progress UI with planning, rebuild, completion, error states. Dry-run mode with plugin-data planning. Sync record rebuild with conflict resolution. Rebuild cancellation + stable operation rows.
- **T57 — Plugin Data Sync**: Identity-scoped cache/index/plugin state. Durable retry records. Encrypted/checksummed envelopes. Atomic writes + conflict reporting.

### Diagnostics & UX
- **T61 — Debug Commands**: `!debug history/tokens/context/help` commands.
- **T49 — Settings Export/Import**: Vault-native, redacts API keys.
- **T51 — Opt-in Telemetry**: Disabled by default, first-run disclosure.
- **T41 — Updater Fix**: Cache-busting for GitHub API, intermittent update detection resolved.

### Tests
- 363 tests across 42 files (T46 merge)
- TypeScript clean, production builds passing

---

## [1.3.5] - 2026-08-16

Last release before 1.4.0 development cycle.

## Unreleased - 2026-08-28

### Fixed
- Routed agent-provider slash commands through the OpenResponses turn
  coordinator so `/create`, `/edit`, and `/append` do not use the unsupported
  standard `streamChat()` path — T46.
- Reused the active `ToolExecutor` when manually approving a tool call so
  continuation and pagination state survive approval — T46/T46a.

### Tests
- Added regression coverage for agent slash-command routing and approval
  executor reuse.
- Verified 42 test files / 363 tests, TypeScript, production build, and the
  changed-file Prettier check after PR #7 was merged as `975bb7e`.

## Unreleased - 2026-08-27

### Changed
- Started the T46/T46a architecture decomposition on
  `feat/t46-architecture-decomposition`: reduced `ToolExecutor.ts` to a
  265-line registry and validation layer, extracted note/path capabilities,
  and added a shared chat-turn coordinator.
- Prompt and OpenResponses tool descriptions now come from the resolved tool
  definitions used for execution.
- Split the remaining capability handlers into separate domain modules and
  added a shared handler context.
- Moved prompt creation, history projection, request budgeting, and model
  message assembly into `ChatTurnRequest.ts`.
- Moved completed assistant-message creation and session-message updates into
  `ChatTurnPersistence.ts`.
- Moved turn output collection into `ChatTurnOutput.ts`, including text around
  tool calls and tool-result updates.

### Tests
- Verified 43 test files / 362 tests, TypeScript, and the production build.

## Unreleased - 2026-08-23

### Changed
- Recorded the merged T48 semantic-compaction implementation (`6a205b9`, PR #5),
  its live fourth-turn validation, and the remaining T48c diagnostic and
  historical-retrieval acceptance gaps — T48/T48a-T48c.
- Recorded the T58d implementation closeout and follow-up audit: plugin data
  is included in normal sync and dry-run planning, but the Rebuild action still
  covers only the chat-session SyncIndex; a separate plugin-data rebuild phase
  remains open — T58/T58c/T58d
- Began T58d implementation: shared planning/progress events, stable operation rows, latest-item shimmer, persistent completion progress, read-only plugin-data dry-run planning, and bounded rebuild transfers.
- Verified the T58d implementation slice with TypeScript, Prettier, the full 269-test suite across 29 files, and a production build.
- Restored T43 to its original Multi-User and Agent Chat scope, migrated the integrated sync UI records to T58/T58a-T58c, and added T58d for the approved progress, dry-run, and rebuild follow-up plan.
- Recorded the task-ID migration and follow-up acceptance boundary across the Memory Bank; no source code changed.
- Corrected remote-storage task statuses and documentation to distinguish the WebDAV session baseline from unfinished full-sync work — T42, T42a–T42e
- Clarified that auxiliary plugin files do not yet share the session encryption, atomic-write, and conflict protections — T43c, T55, T56
- Recorded open retry-queue, cache-invalidation, and full-sync acceptance work — T42
- Added T57 and the plugin-data/SyncIt boundary design: SyncIt owns whole-vault sync, while Chat Lab keeps plugin-specific sync — T57, T57d
- Added the shared plugin-file sync manager with encrypted/checksummed envelopes, atomic writes, damaged-file rejection, and safe conflict reporting — T57a
- Verified the T57a implementation with a clean TypeScript check, full build, and 256 passing tests — T57a
- Added durable per-file shared state, encrypted remote state, recovery copies, explicit conflict choices, and deletion tombstones; unexplained remote disappearance now stops safely — T57b
- Verified T57b with a clean TypeScript check, full build, and 263 passing tests across 27 test files — T57b
- Added identity-scoped cache/index/plugin state and durable retry records — T57c
- Added plugin-data progress and separate complete/partial/failed reporting — T57c
- Persisted provider-reported prompt/completion usage and corrected the usage
  summary fallback to count the full request estimate rather than one message — T6a follow-up
- Verified T57c and token accounting with 268 passing tests, a clean TypeScript
  check, and a production build.

---

## Unreleased - 2026-08-21

### Fixed
- Added a close button to the integrated Sync tab — T43
- Rebuild activity now appears live in the Files list and supports cancellation — T43

### Changed
- Rebuild choices now show results after completion — T43

## Unreleased - 2026-08-14

### Added
- Long-press multi-message selection with Markdown copy — T20
- Per-session Copy and Export dropdowns in Chat History for Markdown, JSON, and JSONL — T20
- Group-chat attachment full replay across local and relay message paths — T19a

### Changed
- Chat History action cards now use compact icon actions and responsive layout — T20
- Update modal now displays commit hash, message, author, and timestamp — T41

## Unreleased - 2026-08-12

### Fixed
- Mobile chat transcript scrolling now has a constrained flex layout and touch-friendly vertical scrolling — T43
- Mobile composer no longer reserves unnecessary bottom padding below the attachment toolbar — T43
- Model-selection badge now reports 0, 1, 2, or more selected models correctly while keeping remote-user counts separate — T43
- TypeScript checks now use the same third-party declaration policy as the production build after dependencies were reinstalled from the lockfile — T43

### Tests
- Added ActionBar regression coverage for model and remote-user badge counts — T43
- Formatted touched files so the changed-files-only GitHub Prettier check passes — T8

## Unreleased - 2026-08-05

### Changed
- Settings section shortcuts now scroll within the settings panel; Diagnostics is more compact and model usage is tabular — T15
- Chat tab title width defaults to 160 px and is configurable from 120–360 px — T15
- Empty chat tabs are live drafts, rather than saved history entries — T15

### Fixed
- The Intelligence shortcut now targets the AI Intelligence Layer section — T15
- The session picker and export omit unsent draft tabs and legacy zero-message sessions — T15

## Unreleased - 2026-05-09

### Added
- `resolveNote()` helper with three-tier basename resolution for tool paths — T13
- `patch_note` tool for search/replace note editing with optional `replace_all` — T13
- `edit_section` tool for rewriting content under a specific heading — T13
- File-based debug logger (`src/logger.ts`) with console interception and memory metrics — T11
- React ErrorBoundary (`ChatErrorBoundary`) for chat panel crash recovery — T11
- Diagnostics panel in Settings with 6 metrics, Refresh, DevTools opener, and Clear History — T11
- Defensive 5-step logging around `MarkdownRenderer.render` in MessageBubble and StreamingBubble — T11

### Changed
- Tool descriptions use human-friendly basename examples (e.g. "Project Notes") — T13
- `scrollIntoView` behavior changed from `"smooth"` to `"auto"` in ChatMessages — T13
- `displayDiagnostics()` call added to Settings `display()` method — T11

### Fixed
- `read_note` and other tools now resolve basenames without `.md` extension — T13
- Raw `[tool_name: ok/error]` status tags removed from visible assistant messages — T13
- Unmount cleanup flags abort stale `MarkdownRenderer.render` callbacks — T13
- Missing `displayDiagnostics()` call site in Settings `display()` method — T11

## Unreleased - 2026-05-02

### Added
- Session-based chat history with SessionPickerModal: archive-on-New, auto-titling, pruning, load/delete - T2
- Shared `src/types.ts` with `ChatMessage`, `ChatSession`, `StoredChatData` interfaces - T2
- `Insert at Cursor` button for assistant replies alongside Append and Copy - T5
- Provider-profile based settings, migration helpers, and active-profile resolution - T9
- Fetch-models entry point and searchable picker shell in settings UI - T10
- Open-source community files and release-announcement draft - T8
- Shared `src/context/tokenEstimator.ts` for consistent token estimation across codebase - T6
- `maxContextMessages` setting to limit conversation history sent to LLM - T6
- Token usage indicator in ContextBar with green/amber/red color coding - T6
- Inline searchable model list in settings with click-to-select and cache persistence - T10

### Changed
- Replaced the LangChain provider layer with Vercel AI SDK based model creation and streaming primitives - T4
- Standardized package-manager workflow on `pnpm` for build, package, and release operations - T8
- Normalized memory-bank task, session, registry, and history records back to the canonical templates - META-1

### Fixed
- Corrected the Kimi base URL to `https://api.moonshot.ai/v1` - T4
- Updated release workflows and metadata paths to match the renamed Obsidian AI project identity - T8
- Model discovery cache now persisted in `ProviderProfile.modelCache` and invalidated on profile changes - T10
- Settings profile fields save immediately on change instead of waiting for blur - T9

### Removed
- Legacy `@langchain/*` dependencies from the active implementation path - T4
