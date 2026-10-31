# Chat Lab AI Changelog

Notable user-facing changes are recorded here. Dates reflect the project release
records; unreleased development notes remain in the Memory Bank.

## [1.10.0] - 2026-10-31

### Added

- Add tags to saved chat sessions, filter History by tag, and manage labels
  across sessions with a review-first normalization flow.
- Add opt-in automatic suggestions, manual and bulk tag generation, and agent
  tools for managing session tags.
- Preserve session tags through migration, chat archives, and remote sync.

### Changed

- Show tag previews and session counts in the searchable Chat History.

## [1.9.1] - 2026-10-22

### Fixed

- Use Obsidian's settings heading API in the settings error fallback.
- Improve popout-window compatibility for timers, animation frames, and DOM
  element checks.
- Respect Obsidian's file deletion preference when deleting notes.
- Remove redundant type declarations, regex escapes, and an unnecessary await.

## [1.9.0] - 2026-10-22

### Added

- Editable shared agent-prompt controls, including agent tools to read, update,
  and reset the prompt, plus a copyable preview of the latest system prompt.
- Agent tools for listing, reading, searching, opening, renaming, and deleting
  saved chat sessions. Deletion requires explicit approval.
- A configurable limit for simultaneous session replies, defaulting to five.

### Changed

- Removed the legacy selection and cursor prompt editor while keeping
  Chat Lab's Apply-to-Note review flow.
- Simplified PDF attachment cards, added per-tab generation indicators, and
  improved equation scrolling and reply-follow behavior.

### Fixed

- Improved session deletion approvals, cancellation, retries, draft restoration,
  and cross-tab cleanup.
- Protected active sessions across panes and prevented delayed sync from
  overwriting newer local edits or deletions.

## [1.8.0] - 2026-10-20

### Added

- Chat data health checks and a review-first repair flow with verified backups.
- Provider- and model-aware reasoning controls, plus clearer token estimates
  for external images.
- Bounded line-range reading for large notes and broader past-session search
  across titles and message content.
- A toolbar overflow action to check for plugin updates.
- A first-install robot assembly-line splash in the empty chat view.

### Changed

- Improved session coordination across chat tabs and restored conversations.
- Added compact shortcuts for navigating Settings sections.
- Assistant messages now use the full chat width.

### Fixed

- Strengthened transcript saves, deletion handling, duplicate-message cleanup,
  and retry behavior to protect chat history.
- Improved Codex note-edit safety and model selection, composer acceptance,
  and visibility of completed tool calls while responses stream.

## [1.7.1] - 2026-10-17

### Fixed

- Require Obsidian 1.11.4 or newer, matching the secure credential storage API
  used for Codex account sign-in.
- Use Obsidian CSS helpers for chat composer sizing and reference overlay
  positioning.

## [1.7.0] - 2026-10-17

### Added

- Codex account sign-in as a provider profile, with device-code login, model
  discovery, and credential refresh. Requires Obsidian 1.11.4 or newer.
- Optional, bounded, read-only Dataview DQL queries when Dataview is available.
- Agent access to a summary of the plugin's identity and available capabilities.

### Changed

- Reworked the chat composer with per-chat attachment drafts and clearer
  references to selected notes, folders, and tags.
- Improved the responsive chat toolbar and made wide Markdown tables scroll
  horizontally.

### Fixed

- Prevented an in-flight Codex credential refresh from restoring credentials
  after sign-out or a profile change.
- Improved mobile vault-link navigation and cancellation of pending tool
  approvals.

## [1.6.0] - 2026-09-24

### Added

- Git integration write tools for staging selected paths, committing, pulling,
  and pushing through the Integration Provider API.
- Bounded retrieval of earlier tool results with stable references, plus
  persisted provenance for conversation compaction.
- App-wide sync status, transfer summaries, per-operation activity, structured
  failures, and an in-app sync log.

### Changed

- Chat startup loads session indexes first and reads full transcripts when
  needed, improving startup and large-chat responsiveness. Streaming follow,
  scroll restoration, and message rendering were also improved.
- Context preparation now bounds tool-result replay, preserves complete
  transcripts for display and export, and aligns debug history with the
  context sent to models. Compaction notices and recovery metadata persist
  across reloads.
- Settings search, advanced sections, model identity, chat exports, and local
  request diagnostics were improved.
- Sync now presents an examination and transfer plan before running. It reports
  titles, counts, bytes, progress, and local persistence stages, and supports
  rebuilding the chat-session index.
- Automatic sync is temporarily disabled until verified. Use **Sync Now** for
  manual synchronization.

### Fixed

- Prevented incomplete or empty session data from overwriting intact history;
  omitted remote sessions are retained unless deletion is explicit.
- Fixed downloaded chats opening empty, failed hydration reads being treated
  as complete, stale cache entries, and partial-index truncation.
- Improved recovery of downloaded chats, image-bearing conversation replay,
  provider tool registration, and chat-history exports.
- Hardened settings tools and debug logging, and made development pre-release
  publication continue when a rolling tag update fails.

### Known limitation

- Global search currently searches loaded conversation messages; unopened
  index-only sessions may not appear in results.

## [1.5.0] - 2026-09-08

- Improved provider-scoped model selection and recent-model history.
- Improved sequential multi-agent context passing, response attribution, and
  tool continuation behavior.
- Added core, staged, and archive memory tiers with curation, ranked archive
  search, migration metadata, and bounded backup cleanup.
- Improved context budgeting, tool-history preservation, and compaction checks.
- Refactored persistence, synchronization, plugin-data sync, and turn actions
  into focused lifecycle modules.
- Improved settings navigation and controls, and split styles into ordered
  source files with deterministic build-time concatenation.
- Cleared the final Community Directory scanner findings for this release.

## [1.4.1] - 2026-08-28

- Addressed Community Plugin review findings involving unsupported APIs and
  dynamic styling.
- Corrected release tag handling and consolidated visibility styling into CSS
  classes.

## [1.4.0] - 2026-08-28

- Decomposed chat-turn orchestration and tool handlers into domain modules.
- Added bounded context and tool-result replay, semantic compaction, and a
  context benchmark harness.
- Added a canonical tool registry, stricter tool validation, bounded result
  pagination, and stateful OpenResponses continuations.
- Added remote chat and plugin-data synchronization with progress, rebuild,
  retry, conflict, checksum, and atomic-write handling.
- Added debug commands, settings export/import, and disabled-by-default
  telemetry controls.

## [1.3.5] - 2026-08-16

- Final release of the 1.3 series before the 1.4.0 architecture and sync work.

## [1.3.4] - 2026-08-15

- Completed the Community Directory compatibility review for the plugin's
  identity, supported APIs, packaging, and release metadata.

## Earlier project history

The initial releases established the product features that continue through
the versions above:

- Persistent, titled chat sessions; streaming responses; provider profiles;
  model discovery; and context-size controls.
- Vault-aware context, note creation and editing tools, searchable note
  actions, and insertion of assistant responses into the active note.
- Group chat, remote participants, relay-based multi-device chat, and
  attachment replay.
- Chat history selection and Markdown, JSON, and JSONL export.
- Debug logging, crash recovery, diagnostics, mobile layout improvements, and
  the stable/development updater channels.
- Community Plugin release workflows, compatibility fixes, and privacy
  controls for settings and telemetry.
