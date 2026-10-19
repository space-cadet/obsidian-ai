# Shared Session State Coordination Plan

*Created: 2026-10-19 20:54 IST*
*Status: IN PROGRESS — owner operations and source migration implemented; tabless-session fix awaits live retest in T24c.*
*Memory Bank task: [T24c](../tasks/T24c.md)*
*Beads task: `OBSIDIANAI-brl` (label: `T24c`)*

## Purpose

Define one small owner for persistent chat-session state and the operations that
change it. This plan addresses the repeated class of bugs where storage, React
views, lifecycle saves, and sync each keep a partial or stale view of the same
session.

The intended change is a bounded rewrite of session-state ownership and its
operation paths. It reuses the existing session format, `ChatStorage` file
transaction and recovery code, and sync engine. It does not propose a new
storage format, a generic state framework, or a rewrite of provider/runtime
code.

## Why this plan is needed

The current implementation has several independent session mutation paths:

- `src/hooks/useChatSession.ts` owns per-view React session state and active
  session hydration.
- `src/hooks/useSessionActions.ts` opens and deletes sessions and can hydrate a
  session separately from the active-view effect.
- `src/hooks/useMessageActions.ts` checks storage hydration before sending and
  then delegates to the turn lifecycle.
- `src/hooks/useContextItems.ts`, `src/components/ChatApp.tsx`,
  `src/agent/turnLifecycle.ts`, and `src/agent/turnActions.ts` also update
  session data.
- `src/lifecycle/persistence.ts` queues whole snapshots for durable writes.
- `src/lifecycle/sync.ts` loads, merges, and saves archive snapshots outside
  the view-owned session state.

The latest PR review identified a concrete hydration split: storage can mark a
session hydrated and return its messages, while a cancelled view callback drops
those messages. A subsequent send can then trust storage readiness while the
view still has an empty transcript. The exact send timing in that reported
sequence is a source-level race and needs regression coverage.

The source audit also found other possible stale-operation races, including
session switching during asynchronous send preparation and old sync snapshots
overwriting newer local state. These are risks from the current ownership
layout; they are not claimed as device-reproduced failures.

## Goals

1. Keep one authoritative in-memory session state for all Chat Lab views using
   the same plugin instance.
2. Keep transcript readiness with the messages installed into that state.
3. Route persistent session mutations through a small, explicit API.
4. Make asynchronous results safe against a newer edit, a session switch, or a
   deletion.
5. Keep metadata-only operations cheap and preserve intentional transcript
   truncation for edit/retry flows.
6. Preserve the existing JSONL/index format and `ChatStorage` transaction
   boundary.
7. Keep the change small enough that it can be reviewed as a session-state
   ownership refactor rather than a general storage framework.

## Non-goals

- Replacing JSONL, `sessions/index.json`, draft files, or migration format.
- Rewriting `ChatStorage` transaction journaling, validation, or recovery.
- Rewriting `SyncEngine`, WebDAV, provider adapters, or the agent runtime.
- Adding real-time cross-device collaboration or a new conflict-resolution UI.
- Loading every transcript at startup.
- Treating every shorter message list as invalid; edit and retry intentionally
  replace or truncate message history.
- Persisting view-only details such as active tab focus or transient streaming
  presentation in the shared store unless the current product contract already
  persists them.

## Proposed design

### One plugin-owned session state owner

Add a narrowly scoped session state owner to the plugin lifecycle. It holds the
shared session snapshot and provides a subscription for React views. A small
React adapter can use the React subscription API already available in the
project; no new dependency is needed.

The owner coordinates session state and operations. `ChatStorage` remains the
low-level durable archive reader/writer and transaction boundary. It should no
longer own a UI-facing claim that every view has received a transcript merely
because a disk read completed.

Do not add a second permanent session cache beside the existing React arrays.
Views should read the shared snapshot and submit changes through the owner. The
active tab selection and purely visual state can remain view-scoped.

### Session readiness and revisions

Each session state needs only the information required to make operations safe:

- session metadata;
- the current message array when loaded;
- explicit transcript readiness (`unloaded`, `loading`, or `loaded`);
- a local revision that advances when persistent session data changes;
- the last successfully persisted revision, or equivalent dirty state;
- deletion state while a delete is being durably committed.

Keep readiness and the transcript payload in the same owner. A disk read is not
considered complete for the UI until the owner installs its result into the
shared snapshot. If a read returns after a newer message edit or deletion, the
owner discards the stale result. Multiple requests for one session can share a
single in-flight read.

The revision is an in-memory ordering guard, not a new on-disk version format.
The existing index and transcript format remain unchanged.

### Small operation API

Provide a small set of operations with explicit intent, for example:

- `ensureLoaded(sessionId)` — read a transcript only when needed and publish
  readiness and messages together.
- `updateMetadata(sessionId, patch)` — change title, draft, model choices,
  scroll position, context metadata, or other metadata without forcing a full
  transcript read.
- `updateMessages(sessionId, change)` — append, replace, or intentionally
  truncate messages after the caller has a complete transcript.
- `deleteSession(sessionId)` — mark deletion in the owner, persist it through
  the existing transactional storage path, and prevent stale reads or sync
  snapshots from restoring it.
- `applySyncSnapshot(snapshot)` — merge downloaded session data against the
  latest local revisions and explicit deletion state before persistence.
- `flush()` — wait for all pending durable writes for the current owner state.

Names may change during implementation, but the intent of each operation must
remain explicit. Avoid a generic `setSessions` escape hatch for persistent
session changes after migration is complete.

### Operation rules

- Capture `sessionId` when an operation starts. Sends, retries, edits, and
  async preparation must keep targeting that ID if the user switches tabs.
- A session open or send that needs message history must await `ensureLoaded`.
  It must not proceed on storage bookkeeping alone.
- Metadata-only edits do not load the transcript.
- Message replacement, append, edit, and retry operate on a complete current
  transcript. Explicit edit/retry truncation is valid and must persist as
  requested.
- Every async result is applied only if its session still exists and the
  captured revision/generation is still current. A delete invalidates older
  reads and sync results for that ID.
- Failed writes leave the newest state dirty and retryable. A caller awaiting
  a save waits until its state revision is persisted or the operation rejects.
- A view unmount does not discard shared state or pending writes. Plugin
  shutdown must flush the owner before storage cleanup completes.

### Sync and deletion

Sync continues to use its existing adapters and transfer behavior, but applies
incoming data through the shared owner rather than saving an independently
captured whole-session snapshot. The owner merges per session so an older
download cannot replace newer local messages or metadata.

Explicit deletion remains authoritative over stale snapshots. Existing
deletion IDs/tombstones must be carried until the corresponding durable write
succeeds. Sync application must use the same deletion rule. Do not infer
deletion from an omitted session in a partial snapshot.

This plan does not define a new remote conflict policy. If current sync rules
cannot safely choose between genuinely concurrent remote content, preserve the
current behavior and report that conflict instead of silently discarding a
version.

## Migration boundaries

Migrate the existing mutation paths into the shared owner as one coherent
boundary:

1. Initialize the owner from `ChatStorage` metadata using the current
   index-only startup behavior.
2. Route session open, active hydration, and send readiness through it.
3. Route UI message, context, draft, retry/edit, and deletion changes through
   explicit owner operations.
4. Route turn lifecycle and agent callbacks through the operation API, passing
   the captured session ID.
5. Apply sync downloads and deletions through the same owner.
6. Remove duplicate delete/hydration implementations and persistent raw
   `setSessions` mutation paths.
7. Flush dirty owner revisions during plugin shutdown and preserve existing
   unload behavior for logger cleanup.

Implementation can land in several reviewable commits, but do not declare the
ownership problem solved while old persistent mutation paths remain active.
Avoid parallel stores or compatibility layers that indefinitely mirror two
sources of session truth.

## Validation plan

Add focused tests at the owner, React adapter, and storage handoff boundaries.
Required scenarios:

1. A view switches away during hydration; the shared state retains the loaded
   messages, and sending after returning cannot overwrite the old transcript.
2. Two views using the same plugin observe the same loaded session and
   metadata updates.
3. A message edit occurs while hydration is in flight; the older read cannot
   replace the edit.
4. Delete occurs during hydration or sync; the session cannot reappear from a
   late result or stale snapshot.
5. A send starts in session A, the active tab changes to B during async
   preparation, and the turn remains attached to A.
6. Metadata edits work on unloaded transcripts without triggering a message
   read or overwriting transcript content.
7. Edit/retry intentionally truncates history and persists the requested
   message sequence.
8. Concurrent local edits and downloaded sync data preserve the newest local
   revision according to the defined merge rule.
9. Failed persistence remains dirty and retryable; successful flush marks the
   written revision clean.
10. View unmount and plugin shutdown do not drop pending session writes.

Run the focused tests for all migrated paths, relevant broader tests, TypeScript,
production build, formatting, and `git diff --check`. Treat build/test success,
installed plugin behavior, and live Obsidian/device acceptance as separate
evidence.

## Completion criteria

- One plugin-owned session state owner serves all views sharing the plugin.
- All persistent session mutations use the explicit operation API.
- Hydration readiness cannot become true while the shared view-facing state is
  missing the corresponding transcript.
- Stale reads, sends, sync results, and deletes cannot redirect or roll back a
  newer session revision.
- Metadata-only updates preserve lazy transcript loading.
- Existing JSONL transactions and file format remain in use.
- Required race and lifecycle tests pass, with build and live acceptance
  recorded separately.
- No second long-lived session store or new state-management dependency is
  introduced.

## Related work

- `T24b` — current transcript write integrity and index reconciliation work.
- `T15` — tabbed chat views and active session behavior.
- `T42` — remote chat synchronization.
- `T67` — lifecycle module boundaries; this plan concerns state ownership,
  not file splitting by line count.
- `memory-bank/implementation-details/chat-session-persistence.md` — prior
  session format and persistence history.

## Planning status

This plan follows the source audit recorded on October 19, 2026. The source
audit was performed on `ui-chat-fixes` at `cd4478b` (T24b queued-save
preservation), before Beads initialization created the local setup commit
`bbd3dab`. The hydration review finding was still unresolved. No product code
change, test result, or device acceptance is implied by this document.
