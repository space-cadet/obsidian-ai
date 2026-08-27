# T46 Remaining Work Plan

**Date**: 2026-08-27
**Scope**: Complete remaining T46 extractions

## Extraction 1: useMessageActions.ts → Turn Lifecycle Module

**Current**: 1,533 lines
**Target**: Thin UI adapter (~200 lines)
**Extract to**: `src/agent/turnLifecycle.ts`

### What to Extract
- `handleSend()` — entire send logic including group chat and single chat paths
- Streaming callbacks (onChunk, onToolCall, onDone, onError)
- Approval resolution/rejection
- Interruption handling (handleStop)
- Retry logic (handleRetry)
- Edit logic (handleEditMessage)
- Compaction trigger logic

### What Stays in Hook
- UI state updates (via callbacks passed to turn lifecycle)
- React refs and state setters
- Attachment/context item management

## Extraction 2: api.ts → Provider/History/Streaming Modules

**Current**: 765 lines
**Target**: ~300 lines (ChatAPIManager orchestrator only)
**Extract to**:
- `src/api/providers.ts` — `createLanguageModel()` + all provider factories
- `src/api/history.ts` — `MessageQueue` class + history management
- `src/api/streaming.ts` — `streamChatWithTools()` + event translation

### What Stays in api.ts
- `ChatAPIManager` class (orchestrator only)
- Profile validation
- Connection testing

## Extraction 3: main.ts → Lifecycle Modules

**Current**: 1,785 lines
**Target**: ~300-400 lines
**Extract to**:
- `src/ui/registration.ts` — View registration, commands
- `src/ui/events.ts` — Event handlers (layout ready, workspace changes)
- `src/lifecycle/storage.ts` — Storage init, migration

### What Stays in main.ts
- `ObsidianAIPlugin` class
- `onload()` — delegates to modules
- `onunload()` — cleanup

## Execution Order

1. **api.ts first** — Cleanest extraction, no dependencies on other extractions
2. **main.ts second** — Straightforward lifecycle split
3. **useMessageActions.ts last** — Most complex, depends on understanding the others

## Verification

- All 359 tests must pass
- Build must succeed
- No functional regressions
