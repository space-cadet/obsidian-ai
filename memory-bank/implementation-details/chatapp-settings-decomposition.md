# Implementation Detail: ChatApp + Settings Decomposition
*Created: 2026-05-28 23:10 IST*
*Related Tasks: T22, T23*

## Context
Deepak identified that `ChatApp.tsx` (1,948 lines) and `settings.ts` (1,187 lines) are unmaintainably large. This doc records the full analysis and refactoring strategy.

## File Size Report

### Source Code (prioritized by pain)
| File | Lines | Size | Verdict |
|------|-------|------|---------|
| `src/components/ChatApp.tsx` | 1,948 | 63 KB | 🔥 **Critical** — heart of plugin, nearly 2K lines |
| `src/settings.ts` | 1,187 | 34 KB | 🔥 **Critical** — 836 lines of UI in config file |
| `src/agent/ToolExecutor.ts` | 865 | 25 KB | ⚠️ Large — tool defs + execution + formatting |
| `src/components/ProfileCard.tsx` | 698 | 21 KB | ⚠️ Large — UI component |
| `src/api.ts` | 689 | 19 KB | ⚠️ Large — broad API surface |
| `src/components/ChatInput.tsx` | 616 | 16 KB | ⚠️ Large |
| `src/modules/WidgetExtension.ts` | 577 | 15 KB | ⚠️ Large — inline tooltip + widget |

### Build Artifacts (expected)
| File | Size | Notes |
|------|------|-------|
| `main.js` | 1.3 MB | Compiled esbuild bundle — normal |
| `styles.css` | 57 KB | Compiled CSS — acceptable |

## ChatApp.tsx Deep Analysis

### What's Inside (1,948 lines)

**Top-level helpers (lines 1–300):**
- `buildSystemPrompt()` — ~55 lines, builds tool-aware system prompt
- `generateSessionTitle()` — ~80 lines, heuristic title generation with stop-word filtering
- `generateSessionTitleLLM()` — ~40 lines, LLM-based title generation
- `pruneSessions()` — ~14 lines
- `makeId()` — ~4 lines
- `SlashCommand` interface + `parseSlashCommand()` — ~12 lines
- `contextItemKey()`, `sameContextItems()` — ~20 lines
- `getAgentColor()`, `getAgentIcon()` — ~22 lines

**Component body (lines 301–1,947):**

State declarations (~24 useState):
- Session state: `sessions`, `activeSessionId`
- Streaming state: `isStreaming`, `currentAiMessage`, `currentContentParts`
- Context state: `contextItems`, `wasTruncated`, `contextTokenCount`, `targetNoteName`
- Modal state: `showSessionPicker`, `showExportModal`, `showContextPicker`
- Editing state: `isEditing`, `originalMessages`, `editMessageText`
- Group chat state: `selectedProfileIds`, `typingAgents`, `showParticipantDropdown`
- Feature toggles: `zenMode`, `debateMode`, `showThinking`, `thinkingEnabled`
- Tool state: `pendingToolCall`
- Meta state: `chatDataLoaded`, `messageAttachments`

Refs (~10):
- `controllerRef` — AbortController for streaming
- `saveTimerRef`, `skipNextAutosaveRef` — debounced auto-save
- `resolveToolRef` — tool approval promise resolver
- `messagesRef`, `contextItemsRef`, `sessionsRef`, `activeSessionIdRef` — mirror refs to avoid stale closures
- `lastMarkdownLeafRef` — leaf tracking for active note context
- `llmNamedRef` — deduplication for LLM naming

Effects (~8):
- Click-outside detection for participant dropdown
- Profile/participant sync
- Session persistence (auto-save on change)
- Leaf change tracking
- Chat data loading from persistence
- Settings sync tick
- Auto-save timer
- Participant sync on session switch

Handlers (~25):
- `handleToggleProfile` — group chat participant toggle
- `handleToggleDebateMode` — debate mode toggle
- `handleToggleActiveNote` — add/remove active note context
- `handleRemoveContextItem` — remove context item
- `handleAddMention` — add mention context
- `handleAddContextItems` — bulk add context
- `handleSend` — **~660 lines**, the monster: streaming, tool loop, group chat broadcast, error handling, approval flow
- `handleStop` — abort streaming
- `handleNewChat` — create new session
- `handleAppend` — append content to note
- `handleInsertAtCursor` — insert at cursor
- `handleApply` — apply content to target note
- `handleRetry` — retry message
- `handleEditMessage` — edit message
- `handleCancelEdit` — cancel edit
- `handleApplyToTarget` — apply to specific target
- `handleCreateNote` — create note from content
- `handleAppendToTarget` — append to specific target
- `handleLoadSession` — switch session
- `handleDeleteSession` — delete session
- `handleRenameSession` — rename session
- `handleApproveTool` — approve pending tool
- `handleRejectTool` — reject pending tool
- `handleToggleAutoApprove` — toggle auto-approve
- `handleToggleAutoName` — toggle auto-name
- `handleManualRename` — manual title rename
- `handleExportChat` — export chat

JSX (~300 lines):
- Layout shell with zen mode conditional
- `ActionBar` component
- `ChatMessages` component
- `ChatInput` component
- Modal renders (`SessionPickerModal`, `ExportModal`, `ContextPickerModal`)
- `PendingToolCard` conditional render

### Key Insight
`handleSend` alone is ~660 lines. It contains:
1. Message preparation (context resolution, attachment handling, slash command parsing)
2. Single-agent streaming path (with tool loop)
3. Multi-agent group chat path (with orchestrator, per-agent streaming, debate mode)
4. Tool approval flow (promise-based resolver)
5. Error handling and retry logic
6. Title generation after first exchange

This should be its own module, not a function inside a component.

## Settings.ts Deep Analysis

### What's Inside (1,187 lines)

**Config layer (lines 1–351):**
- `debounce()` helper — 10 lines
- Types: `ProviderType`, `WebSearchProvider`, `ModelCache`, `ProviderProfile`, `ObsidianAISettings`, `LegacySettings`
- Constants: `DEFAULT_PROFILE_ID`, `generateId`
- Defaults: `getProviderColor`, `getDefaultProfileName`, `getDefaultModel`, `getDefaultEndpoint`
- Factory: `createProviderProfile`
- Defaults object: `DEFAULT_PROFILES`, `DEFAULT_SETTINGS`
- Migration: `normalizeSettings` (~55 lines), `getActiveProviderProfile`, `createProfileFromLegacySettings`, `normalizeProviderProfile`

**UI layer (lines 352–1,187):**
- `ObsidianAISettingsTab` class extending `PluginSettingTab`
- `display()` method that builds the entire settings UI
- Provider profile section (add, edit, delete, copy, API key, endpoint, model)
- Web search provider section
- Feature toggles (auto-apply, auto-name, debug logging)
- Onboarding settings
- Appearance settings

### Key Insight
The `display()` method is ~800 lines of sequential `settingTab.addSetting()` calls. Each feature addition appended to the end. No sub-structure.

## Proposed Architecture After Refactor

### Chat Layer
```
src/
  components/
    ChatApp.tsx              (~300 lines — wiring only)
    ChatLayout.tsx           (~150 lines — layout shell)
    ChatToolbar.tsx          (~100 lines — action bar)
  hooks/
    useChatSession.ts        (~450 lines — session CRUD, persistence, titles)
    useChatUI.ts             (~250 lines — modals, toggles, indicators)
    useMessageActions.ts     (~200 lines — apply, insert, retry, edit)
    useSendMessage.ts        (~400 lines — extracted from handleSend)
  lib/
    systemPrompt.ts          (~60 lines)
    sessionTitle.ts          (~120 lines — heuristic + LLM)
    slashCommand.ts          (~20 lines)
    contextUtils.ts          (~25 lines)
    agentVisuals.ts          (~25 lines)
```

### Settings Layer
```
src/
  settings.ts                (~350 lines — types, defaults, helpers only)
  settings/
    SettingsTab.ts           (~100 lines — orchestrator)
    sections/
      ProviderSection.ts     (~250 lines)
      ModelSection.ts        (~150 lines)
      FeatureSection.ts      (~150 lines)
      AppearanceSection.ts   (~100 lines)
```

## Execution Order
1. **T23 first** (lower risk, isolated from chat runtime)
2. **T22 Phase 5** (move standalone utilities — zero risk)
3. **T22 Phase 1** (extract `useChatSession` — medium risk, test thoroughly)
4. **T22 Phase 2+3** (extract UI and message action hooks)
5. **T22 Phase 4** (extract layout components)
6. **T22 Phase 1b** (extract `useSendMessage` from handleSend — highest risk)

## Verification Checklist
- [ ] Build passes: `pnpm run build`
- [ ] No type errors
- [ ] Obsidian loads plugin without console errors
- [ ] Chat opens and streams
- [ ] Sessions save and load
- [ ] Group chat works (multi-agent)
- [ ] Tool approval flow works
- [ ] Settings UI opens and all sections functional
- [ ] Provider profile CRUD works

## Anti-Patterns to Avoid
- **Don't create hook spaghetti.** If two hooks need to share state, use a context or lift state, not 5 layers of prop drilling.
- **Don't over-extract.** A 200-line component with 3 well-defined responsibilities is fine. A 50-line component with 1 responsibility is ideal.
- **Preserve ref mirrors.** `messagesRef`, `sessionsRef`, etc. exist to solve stale closure problems in async callbacks. Any extraction must handle this correctly (either pass refs or use functional setState).
