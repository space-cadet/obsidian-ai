# System Patterns: InlineAI Plugin
*Created: 2026-05-02 00:00:00 UTC*
*Last Updated: 2026-05-02 00:00:00 UTC*

## Core Principles

1. **KIRSS**: Keep It Really Simple, Stupid — prefer simple solutions, avoid over-engineering
2. **Explicit Approval**: No file modifications, feature additions, or code generation without user approval
3. **Incremental Progress**: Small, validated steps; go slow and steady
4. **Obsidian-First**: Follow Obsidian plugin conventions and API patterns

## CodeMirror 6 Extension Pattern

All editor integrations use the CodeMirror 6 extension system:

- **StateField**: Store per-editor state (e.g., `generatedResponseState`, `currentSelectionState`)
- **StateEffect**: Dispatch typed events to mutate state (e.g., `commandEffect`, `acceptTooltipEffect`, `dismissTooltipEffect`)
- **ViewPlugin**: React to editor view changes (e.g., `FloatingTooltipExtension`)
- **Decoration**: Apply visual markers (e.g., diff additions/deletions in `diffExtension`)

Extensions are registered via `plugin.registerEditorExtension([...])` in `onload()`.

## AI Provider Pattern

`ChatApiManager` is the single point of contact for AI API calls:
- Constructed once in `onload()` with current settings
- Wraps LangChain chat model instances
- Exposes streaming interface to extensions
- Provider switching handled by settings change → plugin reload

## Settings Pattern

- All configurable values live in `InlineAISettings` interface (`settings.ts`)
- `DEFAULT_SETTINGS` provides fallback values
- Settings tab (`InlineAISettingsTab`) is registered once and mutates `plugin.settings`
- Settings are saved with `plugin.saveData()` after each change

## Diff Visualization Pattern

- Raw AI response text is compared to original selection using `diff-match-patch`
- Diff result is rendered as CodeMirror Decorations:
  - Additions: `mark` decoration with addition CSS class
  - Deletions: `replace` decoration with deletion widget
- Accept: apply the AI text to the document, remove decorations
- Dismiss: remove decorations, restore original state

## File Organization Conventions

- Each module in `src/modules/` has a single clear responsibility
- Entry point (`main.ts`) wires modules together but contains minimal logic
- State and effects are co-located with the extension that owns them
- Shared types/interfaces defined in the file that first introduces them

## Memory Bank Update Protocol

When updating memory bank files:
1. Always include `*Last Updated: YYYY-MM-DD HH:MM:SS UTC*` at the top
2. Add an entry to `edit_history.md` (newest first)
3. Update `activeContext.md` to reflect current focus
4. Update `session_cache.md` after completing a session
5. Never delete session files — they are append-only history

## Timestamp Format

All timestamps use: `YYYY-MM-DD HH:MM:SS TZ`
Example: `2026-05-02 14:30:00 UTC`

## Task Status Indicators

- 🔄 In Progress
- ✅ Completed
- ⏸️ Paused
- ❌ Cancelled
- ⬜ Not Started
