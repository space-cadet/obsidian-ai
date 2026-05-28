# Edit Chunk — T22 Phase 0 + Phase 1
*Created: 2026-05-28 23:45 IST*
*Task: T22 — ChatApp.tsx Component Decomposition*

## Summary
Refactored ChatApp.tsx from 1,948 to 1,533 lines by extracting standalone utilities into `src/lib/` and session management into `useChatSession` hook. Build passes. No functional changes.

## Phase 0: Utility Extraction (1,948 → 1,700 lines)

### New Files
- `src/lib/agentVisuals.ts` — `getAgentColor()`, `getAgentIcon()`
- `src/lib/contextUtils.ts` — `contextItemKey()`, `sameContextItems()`
- `src/lib/slashCommand.ts` — `SlashCommand` interface, `parseSlashCommand()`
- `src/lib/sessionUtils.ts` — `makeId()`, `pruneSessions()`
- `src/lib/sessionTitle.ts` — `generateSessionTitle()` (heuristic), `generateSessionTitleLLM()`
- `src/lib/systemPrompt.ts` — `buildSystemPrompt()`

### Modified
- `src/components/ChatApp.tsx` — Removed 6 inline function definitions, added imports from new modules

## Phase 1: useChatSession Hook (1,700 → 1,533 lines)

### New File
- `src/hooks/useChatSession.ts` (317 lines)
  - State: `sessions`, `activeSessionId`, `chatDataLoaded`, `autoNameSessions`
  - Refs: `sessionsRef`, `activeSessionIdRef`, `llmNamedRef`, `saveTimerRef`
  - Effects: load on mount, debounced save (150ms), auto-title (LLM + heuristic)
  - Actions: `createNewSession`, `deleteSession`, `renameSession`, `updateSessionMessages`, `updateSessionContextItems`, `manualRenameActiveSession`

### Modified
- `src/components/ChatApp.tsx`
  - Replaced session state block with `useChatSession({ plugin, profileId })`
  - Removed: load effect, save effect, auto-title effect
  - Updated `handleNewChat` to use `createNewSession`
  - Updated `handleRenameSession` to use `renameSession`
  - Updated `handleToggleAutoName` to use hook's `setAutoNameSessions`
  - Updated `handleManualRename` to use `manualRenameActiveSession`
  - Kept `handleLoadSession` and `handleDeleteSession` in ChatApp (profile restoration logic)

## Build Verification
- `npm run build` — ✅ Passes (tsc + esbuild)

## Line Counts
| File | Before | After |
|------|--------|-------|
| ChatApp.tsx | 1,948 | 1,533 |
| useChatSession.ts | — | 317 |
| lib/*.ts (6 files) | — | 305 |

## Next
Phase 2: `useChatUI` hook (modals, zen mode, debate mode, thinking, auto-approve, typing indicators)
