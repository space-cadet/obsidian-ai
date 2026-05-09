# Changelog

All notable changes to this project will be documented in this file.

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
