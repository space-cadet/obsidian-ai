# Refactored Architecture Guide

*Created: 2026-05-29*
*Last Updated: 2026-08-27 18:10:37 IST*
*Applies to: obsidian-ai plugin codebase*

## Overview

This document describes the refactored codebase architecture after T22 (ChatApp.tsx decomposition) and T23 (Settings.ts decomposition). It serves as the canonical reference for where code lives, how modules relate, and what conventions to follow when adding new features.

Current measurements and follow-up boundaries are maintained here after later
T15, T34, T40, T43, T44, T60, and T64 work. **T22 remains complete; the next
decomposition priority is T46/T46a: capability execution, chat-turn
orchestration, and then the larger plugin/API files.**

## Guiding Principles

1. **Single Responsibility**: Each file does one thing. A settings file holds config. A component renders UI. A hook manages state.
2. **Size Budgets**: No file in `src/` should exceed 1,000 lines. Target: <500 lines for components, <300 for hooks, <200 for utilities.
3. **Co-location**: Related code lives together. Settings UI sections live in `settings-sections/`. Chat UI hooks live in `hooks/`.
4. **Pure Config Separated from UI**: Types, defaults, and pure helpers live in data files. UI rendering lives in component files.
5. **Backward Compatibility**: When moving code, re-export from the old location so existing imports don't break.

## Module Structure

```
src/
├── settings.ts                    # Pure config: types, defaults, normalizeSettings (341 lines)
├── settings-sections/             # Settings tab UI (T23)
│   ├── SettingsTab.ts             # Orchestrator: display() method
│   ├── helpers.ts                 # Shared: createSection, getProviderLabel
│   ├── hero.ts                    # Hero banner with active profile
│   ├── providerProfiles.ts        # React ProfileList mount
│   ├── chatDefaults.ts            # Context, auto-name, limits
│   ├── agentTools.ts              # Tools toggle, auto-apply, max steps
│   ├── webSearch.ts               # Provider dropdown, API keys
│   ├── advanced.ts                # Prompts, message history
│   ├── customCommands.ts          # Slash command CRUD
│   └── diagnostics.ts             # Metrics, debug level, clear history
│
├── components/                    # React UI components
│   ├── ChatApp.tsx                # Controller/composition root (1,029 lines)
│   ├── ChatMessages.tsx           # Message list rendering
│   ├── MessageBubble.tsx          # Individual message bubble
│   ├── ChatInput.tsx              # Input bar with attachments
│   ├── ActionBar.tsx              # Toolbar with participant controls
│   ├── ProfileCard.tsx            # Profile editor UI
│   ├── ProfileIndicator.tsx       # Active profile badge
│   ├── PendingToolCard.tsx        # Tool approval card
│   ├── ToolResultCard.tsx         # Tool result display
│   ├── ContextPickerModal.tsx     # Note selection modal
│   ├── GroupChatApp.tsx           # Group chat variant
│   ├── ChatLayout.tsx             # Layout shell (extracted)
│   ├── ChatToolbar.tsx            # Toolbar/participants (extracted)
│   ├── ChatMainArea.tsx           # Messages/composer (extracted)
│   └── ChatOverlays.tsx           # Modal composition (extracted)
│
├── hooks/                         # React hooks
│   ├── useChatSession.ts          # Session CRUD, persistence, auto-naming
│   ├── useChatUI.ts               # UI state: modals, toggles, typing indicators
│   ├── useMessageActions.ts       # Send, retry, edit, apply, tool approval (1,350 lines; T46a)
│   ├── useSettings.ts             # Settings access
│   └── __tests__/                 # Hook tests
│       ├── useChatUI.test.ts      # 31 tests for UI state
│       └── useMessageActions.test.ts # 21 tests for message actions
│
├── lib/                           # Utility functions (T22 Phase 0)
│   ├── agentVisuals.ts            # Agent color/icon helpers
│   ├── contextUtils.ts            # Context building utilities
│   ├── slashCommand.ts            # Command parsing
│   ├── sessionUtils.ts            # Session manipulation
│   ├── sessionTitle.ts            # Auto-title generation
│   └── systemPrompt.ts            # System prompt construction
│
├── agent/                         # Agentic logic
│   ├── AgentLoop.ts               # Tool calling loop
│   ├── ChatTurnCoordinator.ts     # Shared native/OpenResponses turn runner (T46a)
│   ├── ChatTurnRequest.ts         # Prompt, history, and request assembly (T46a)
│   ├── ChatTurnPersistence.ts     # Completed message and session updates (T46a)
│   ├── ChatTurnOutput.ts           # Text and tool-result collection (T46a)
│   ├── ToolExecutor.ts            # Registry-backed tool execution layer (292 lines; T46)
│   ├── tools/                     # Resolved definitions, lookup, and handlers (T46)
│   │   ├── ToolHandlerContext.ts   # Shared services for capability handlers
│   │   └── handlers/               # Note, bulk, discovery, vault, web, memory, session, settings
│   ├── tools.ts                   # Tool definitions (Zod schemas)
│   └── MentionParser.ts           # @AgentName parsing
│
├── api.ts                         # LLM API abstraction (765 lines; later T46 phase)
│
├── storage/                       # Persistence layer
│   ├── ChatStorage.ts             # Interface + factory (ChatStorage, createStorage)
│   ├── LegacyStorage.ts           # JSON file storage
│   └── JsonlStorage.ts            # JSONL line storage
│
├── search/                        # Search/indexing
│   └── index.ts                   # Full-text search engine
│
├── context/                       # Context management
│   ├── ContextEngine.ts           # Folder/tag/note resolution
│   └── ChatContext.ts             # Chat context building
│
├── utils/                         # Utilities
│   └── PdfExtractor.ts            # PDF text extraction
│
├── modules/                       # Obsidian integrations
│   ├── WidgetExtension.ts         # Inline tooltip (577 lines)
│   └── commands/                  # Slash commands
│       └── source.ts
│
├── types.ts                       # Shared TypeScript types
├── main.ts                        # Plugin entry point (1,785 lines; later T46 phase)
└── default_prompts.ts             # Default prompt templates
```

T44 planned host boundary:

```text
src/host/
├── ChatHost.ts                     # Neutral UI-facing capability interfaces
└── ObsidianChatHost.ts             # Production adapter over Obsidian APIs
```

Standalone stories should depend on fixture implementations of `ChatHost`;
only the production adapter should depend on Obsidian APIs.

## Settings Architecture (T23)

### Before
- `src/settings.ts` (1,187 lines): types + defaults + UI rendering + 836-line `ObsidianAISettingsTab` class

### After
- `src/settings.ts` (341 lines): types, defaults, pure helpers, legacy migration
- `src/settings-sections/SettingsTab.ts` (87 lines): `ObsidianAISettingsTab` class, `display()` orchestrator
- `src/settings-sections/*.ts` (35–189 lines each): Individual section renderers
- `src/settings-sections/helpers.ts` (46 lines): Shared `createSection()` and `getProviderLabel()`

### Pattern
Each section exports a function with signature:
```typescript
export function renderXSection(
  containerEl: HTMLElement,
  plugin: ObsidianAIPlugin,
  saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
  ... // additional params as needed (e.g., app for diagnostics)
): void
```

The section appends its DOM elements to `containerEl`. It does not return anything. State mutations go through `plugin.settings` and `saveSettings()`.

### Adding a New Settings Section
1. Create `src/settings-sections/mySection.ts`
2. Export `renderMySection(containerEl, plugin, saveSettings)`
3. Import and call it in `SettingsTab.ts` `display()` method
4. Add CSS class `obsidian-ai-settings-section` to the container

## ChatApp Architecture (T22)

### Before
- `src/components/ChatApp.tsx` (1,948 lines): state, effects, handlers, UI, utilities all inline

### After
- `src/components/ChatApp.tsx` (1,029 lines): controller/composition of hooks,
  relay lifecycle, participant state, and JSX; T22 remains complete
- `src/hooks/useChatSession.ts` (317 lines): session state, persistence, CRUD
- `src/hooks/useChatUI.ts` (329 lines): UI state, modals, toggles, participants,
  typing indicators, and attachments
- `src/hooks/useMessageActions.ts` (1,350 lines): message action handlers and
  request lifecycle; T46a tracks extraction of the non-UI coordinator
- `src/hooks/useSessionActions.ts`, `useSettingsActions.ts`,
  `useExportActions.ts`, `useSearch.ts`, and `useContextItems.ts`: extracted
  session, settings, export, search, and context actions from T22 Phase 4
- `src/lib/*.ts` (23–137 lines): extracted utilities

### Pattern
ChatApp.tsx is a composition layer. Its remaining size is a monitoring signal,
but the current architectural priority is the request lifecycle inside
`useMessageActions.ts`, tracked by T46a:
```typescript
const { sessions, activeSessionId, createSession, ... } = useChatSession(plugin);
const { isZenMode, isDebateMode, showThinking, ... } = useChatUI(plugin);
const { handleSend, handleStop, handleRetry, ... } = useMessageActions({
  plugin, sessions, activeSessionId, ...
});
```

The standalone UI preview in T44 must consume the extracted layout and
presentational modules through a fixture host, not import the Obsidian
`ItemView` or production view module.

### Hook Responsibilities
- **useChatSession**: Everything about session lifecycle. Creating, deleting, switching, loading, saving, auto-naming, manual renaming.
- **useChatUI**: Everything about UI state that is not message data. Modals (open/closed), toggles (zen/debate/thinking), dropdowns, typing indicators, attachment state, editing state.
- **useMessageActions**: Everything that happens when the user interacts with messages. Send, stop, retry, edit, delete, apply, append, approve/reject tools.

## Import Conventions

### Settings (T23)
```typescript
// From main.ts or other files that need the tab
import { ObsidianAISettingsTab } from "./settings-sections/SettingsTab";

// From files that need types/config only
import { ProviderProfile, ObsidianAISettings } from "./settings";

// settings.ts re-exports for backward compatibility:
export { ObsidianAISettingsTab } from "./settings-sections/SettingsTab";
```

### Chat (T22)
```typescript
// Hooks
import { useChatSession } from "../hooks/useChatSession";
import { useChatUI } from "../hooks/useChatUI";
import { useMessageActions } from "../hooks/useMessageActions";

// Utilities
import { getAgentColor } from "../lib/agentVisuals";
import { buildContext } from "../lib/contextUtils";
```

## Size Budgets

| Category | Target Max | Hard Limit | Current Largest |
|----------|-----------|------------|-----------------|
| Settings config | 400 lines | 500 | settings.ts: 341 ✅ |
| Settings sections | 200 lines | 300 | diagnostics.ts: 189 ✅ |
| React components | 500 lines | 700 | ChatApp.tsx: 1,029 ⚠️ |
| Hooks | 400 lines | 600 | useMessageActions.ts: 1,252 ❌ |
| Utilities | 150 lines | 200 | sessionTitle.ts: 137 ✅ |
| Agent logic | 500 lines | 700 | ToolExecutor.ts: 265 ✅ |
| API layer | 400 lines | 500 | api.ts: 765 ⚠️ |
| Plugin entry | 400 lines | 500 | main.ts: 1,785 ❌ |

**Note**: `useMessageActions.ts` (1,252), `main.ts` (1,785), and `api.ts`
(765) remain decomposition candidates. `ToolExecutor.ts` is now 292 lines,
with its remaining handler domains tracked under T46. `ChatApp.tsx` is large
but already acts primarily as a composition layer. T46 tracks the physical
work and T46a tracks the chat-turn coordinator.

## Testing

### Hook Tests
- `src/hooks/__tests__/useChatUI.test.ts` — 31 tests for UI state management
- `src/hooks/__tests__/useMessageActions.test.ts` — 21 tests for message actions

### Running Tests
```bash
pnpm test        # vitest run
pnpm test:watch  # vitest watch mode
```

### Adding Tests for New Hooks
1. Create `src/hooks/__tests__/useMyHook.test.ts`
2. Mock `ObsidianAIPlugin` and `App` as needed
3. Test state transitions, not implementation details

## Refactoring Checklist

When a file grows beyond its target size:

- [ ] Identify the natural boundaries (UI sections, state domains, utility categories)
- [ ] Extract pure utilities first (no dependencies, easy to move)
- [ ] Extract hooks second (self-contained state + effects)
- [ ] Extract sub-components third (JSX + local state)
- [ ] Keep the original file as a composition layer (thin orchestrator)
- [ ] Re-export from original location for backward compatibility
- [ ] Run `pnpm run build` after each extraction step
- [ ] Run `pnpm run test` after each extraction step
- [ ] Update memory bank task files
- [ ] Update this architecture doc if patterns change

## History

- **2026-05-28**: T22 Phase 0+1 — Extracted 6 utility modules + `useChatSession` hook. ChatApp.tsx: 1,948 → 1,533 lines.
- **2026-05-28**: T22 Phase 2 — Extracted `useChatUI` hook + 31 tests. ChatApp.tsx: 1,533 → 1,269 lines.
- **2026-05-28**: T22 Phase 3 — Extracted `useMessageActions` hook + 21 tests. ChatApp.tsx: 1,269 → 636 lines.
- **2026-05-29**: T23 — Extracted `ObsidianAISettingsTab` + decomposed into 8 section files. settings.ts: 1,187 → 341 lines. No files >1,000 lines remain.
- **2026-07-30**: T22 Phase 4 — Extracted session, settings, export, search, and context hooks. ChatApp.tsx: 636 → ~550 lines at that point.
- **2026-08-12**: T43 and related tab/relay work increased the composition surface. ChatApp.tsx grew back to ~1,002 lines.
- **2026-08-17**: **T46 created** — Core orchestration decomposition identified
  as the next priority.
- **2026-08-27**: Architecture review refreshed the measurements and added
  T46a for the chat-turn coordinator. Tool capability ownership remains under
  T60/T60a; model-history policy remains under T48b/T48c/T62a with T64b
  supplying retention evidence.
