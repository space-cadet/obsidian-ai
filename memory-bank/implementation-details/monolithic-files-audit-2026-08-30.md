---
source_branch: main
source_commit: 579252b
---

# Overall Code Review and Monolithic Files Audit — 2026-08-30

**Status**: Audit recorded; the first three T67 storage boundaries are now
completed and the remaining coordinator work is tracked by T67.

## Scope and evidence

This audit reconciles the current checkout with the earlier T46 architecture
review and checks production TypeScript/TSX files, shipped CSS, and the
Memory Bank ownership records.

- Checkout: `main` at `579252b`, aligned with `origin/main`.
- Verification: 46 test files and 403 tests passed; TypeScript passed;
  `git diff --check` passed.
- Root shipped stylesheet: `styles.css`, 5,064 lines.
- The earlier T22/T23 decomposition reduced the original ChatApp and
  settings monoliths, but later feature growth brought some files back above
  the project size guideline.

## Current size hotspots

| File | Lines | Review position |
|---|---:|---|
| `src/lifecycle/storage.ts` | 1,418 | Confirmed cross-domain coordinator; highest current concern |
| `src/sync/PluginFileSyncManager.ts` | 1,256 | Large but cohesive sync transfer/reconciliation module |
| `src/agent/turnLifecycle.ts` | 1,138 | Broad turn boundary; reassess after model-history policy seam |
| `src/components/ChatApp.tsx` | 1,023 | Composition root; size alone does not justify another split |
| `src/sync/SyncEngine.ts` | 1,014 | Large sync engine; decomposition remains deferred |
| `src/components/ChatInput.tsx` | 940 | Input, discovery, attachments, and interaction state are concentrated |
| `src/components/ProfileCard.tsx` | 814 | Profile editor, card, and list are colocated |
| `src/components/MessageBubble.tsx` | 720 | Large rendering component; needs behavior evidence before extraction |
| `src/settings.ts` | 716 | Settings schema/defaults/normalization; previously decomposed but regrew |
| `src/agent/tools.ts` | 698 | Tool definitions and schemas; shares ownership with the registry |
| `src/agent/tools/handlers/discoveryHandlers.ts` | 650 | Domain handler; review separately from orchestration |
| `src/updater/PluginUpdater.ts` | 638 | Updater service and modal presentation are colocated |
| `src/settings-sections/SettingsTab.ts` | 599 | Settings navigation and section orchestration |
| `src/components/ChatSyncPanel.tsx` | 592 | Sync UI component; related to T58d |
| `src/intelligence/ThreeTierMemoryStore.ts` | 616 | New, cohesive memory feature with several internal responsibilities |

The size table is a triage aid, not an extraction order. A file is a
decomposition candidate only when a complete responsibility can move behind a
stable interface with focused tests.

## Comparison with the earlier architecture review

The earlier T46 review identified `ToolExecutor.ts`, `useMessageActions.ts`,
`api.ts`, and `main.ts` as the primary orchestration monoliths. Those findings
were substantially addressed: the current tree has a thin registry-backed
tool executor, a thin message-action adapter, and smaller API and lifecycle
coordinators.

The current audit does not reopen T22/T23 or create a second automatic T46
extraction. T46's existing guidance remains valid: consolidate model-history
policy first, reassess `TurnLifecycle` afterward, keep capability semantics
with T60/T60a, and defer sync decomposition until concrete pressure exists.

## Reassessment: `src/lifecycle/storage.ts`

### Observed responsibilities

The file currently combines these distinct areas:

1. Startup initialization and plugin-directory migration.
2. Logger, settings, provider registry, API, session storage, intelligence,
   and chat-storage construction.
3. Legacy chat-storage migration prompting.
4. Session-end summarization and tiered-memory curation.
5. Sync-engine construction and reconfiguration.
6. Sync-index rebuild, cancellation, manual sync, progress/modal reporting,
   and auto-sync scheduling.
7. Plugin-data serialization, conflict recovery, and selected-file sync.
8. Settings persistence, secret handling, chat-data persistence, queued
   writes, search invalidation, and rolling backups.

### Finding

This is a confirmed responsibility monolith. It is not just a large storage
adapter: it coordinates startup, intelligence, chat persistence, sync
orchestration, UI progress, and recovery policy. The existing extracted
`storage/` classes do not remove the coordination overload in this file.

### Plan

Do not split it by line ranges or by every exported function. First define and
test these seams:

- **Initialization boundary**: settings/logger/provider/intelligence/chat
  storage construction and migration prompts.
- **Chat persistence boundary**: settings and chat-data load/save, queued
  writes, backup rotation, and search invalidation.
- **Sync orchestration boundary**: engine initialization, manual sync,
  rebuild, cancellation, and progress translation. T58d and the existing
  sync modules retain behavior ownership.
- **Plugin-data boundary**: selected plugin-file targets, recovery copies,
  conflict handling, and sync result mapping.
- **Session-end intelligence boundary**: summarization and memory curation,
  coordinated with T65 rather than duplicated here.

Each boundary should be extracted only after its inputs, error behavior,
logging, and lifecycle ownership are tested. The first slice is chat
persistence versus sync orchestration because those have the clearest
different change pressures.

## T67 follow-up — 2026-08-30

The planned storage work continued after this audit:

- `src/lifecycle/persistence.ts` now owns settings and chat-data persistence,
  queued writes, backups, search invalidation, and auto-sync scheduling.
- `src/lifecycle/sync.ts` now owns sync setup, manual sync, index rebuild, and
  cancellation.
- `src/lifecycle/pluginDataSync.ts` now owns selected plugin-data sync,
  serialization, recovery copies, and result reporting.
- `src/lifecycle/storage.ts` is now 227 lines and coordinates startup,
  migration, session-end memory work, and logger cleanup.
- Focused tests cover persistence (18) and plugin-data sync (11). The current
  full suite passes 48 test files / 433 tests.

The old size table above is retained as the audit baseline. The new modules
are responsibility boundaries, not just smaller files. The remaining question
is whether the startup and session-end coordinator code has a clear enough
boundary to split further.

## Refactoring slice — 2026-08-30

- Moved settings and chat-data persistence, queued writes, backup rotation,
  and auto-sync scheduling into `src/lifecycle/persistence.ts`.
- Kept `storage.ts` as the lifecycle coordinator and preserved its existing
  persistence exports for callers during the transition.
- Moved stop, retry, edit, cancel-edit, and tool approval actions into
  `src/agent/turnActions.ts`; `turnLifecycle.ts` still owns the main `send()`
  path and its execution policy.
- The source sizes are now 1,208 lines for `storage.ts`, 214 for
  `persistence.ts`, 1,019 for `turnLifecycle.ts`, and 169 for `turnActions.ts`.
- Verification passed: 46 test files / 404 tests, TypeScript, formatting, and
  `git diff --check`.

This is a responsibility extraction, not a claim that either monolith is
resolved. T67 tracks the next storage slices and focused persistence tests;
T46 retains ownership of the broader turn-lifecycle and provider/runtime
work.

## Reassessment: `src/agent/turnLifecycle.ts`

### Observed responsibilities

The class has one dominant `send()` path plus the related action methods. The
send path currently handles group-chat dispatch, slash commands, context and
attachment resolution, compaction triggering, model-history construction,
tool execution and approval callbacks, standard streaming, output assembly,
error/interruption persistence, and runtime/UI cleanup. The remaining methods
cover stop, retry, edit, cancel-edit, approve-tool, and reject-tool actions.

### Finding

This remains broad, but it is a coherent turn-lifecycle boundary rather than
an arbitrary collection of unrelated utilities. The earlier T46 review was
right not to trigger another automatic extraction immediately. A premature
split could duplicate request policy, persistence, or approval state.

### Plan

1. Keep T48/T48a/T48b/T48c/T62a as the owners of the single model-ready
   history projection for replay, budgeting, truncation, and compaction.
2. Add or complete focused coverage around that boundary before changing
   `TurnLifecycle`.
3. Reassess the class after the policy seam is stable.
4. If it still has a clear split, extract complete concepts such as request
   preparation, lifecycle finalization/persistence, or approval/interruption
   coordination. Do not extract individual callbacks or arbitrary line
   ranges.

The existing `ChatTurnCoordinator` and `ChatTurnOutput` boundaries should be
reused rather than introducing parallel execution or output policy.

## CSS finding and ownership

The root `styles.css` remains a 5,064-line shipped stylesheet. It contains
chat, profiles, settings, updater, participant, sync, progress, and utility
families. No CSS changed in the pulled commit range.

The known CSS debt is duplicate declarations, unnecessary `!important`, and
unsupported or preview-only feature review. These concerns are not owned by
T46, T34, T41, or T58d as a general cleanup. T66 now owns a separate,
explicitly scoped stylesheet architecture and cleanup task.

CSS implementation is intentionally last. Any source split must preserve a
deterministic cascade and the root `styles.css` release artifact, followed by
desktop/mobile UI checks and release-build validation.

## Documentation reconciliation

The current `ai-intelligence-layer.md` correctly identifies T65 as the active
tiered-memory implementation, but older flat-memory examples remain later in
the document. They should either be clearly marked as historical examples or
moved to the superseded architecture document during the T65 migration
follow-up. This is documentation debt, not evidence that the current store is
still flat.

## Decision and next order

1. Keep this audit as the durable overall review record.
2. Keep T46 focused on its existing provider/runtime gates and history-policy
   reassessment boundary.
3. Design the `storage.ts` responsibility seams before extracting code.
4. Reassess `turnLifecycle.ts` only after the model-history seam is stable.
5. Track stylesheet work independently in T66 and implement it last.
6. For every implementation slice, run focused tests, the full test suite,
   TypeScript, the production build, and relevant desktop/mobile acceptance.
