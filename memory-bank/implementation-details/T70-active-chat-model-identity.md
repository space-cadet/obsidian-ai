# T70: Active Chat Model Identity and Switcher Consistency
*Created: 2026-09-02 16:23:33 IST*
*Last Updated: 2026-09-02 18:06:05 IST*

## Purpose

The toolbar has one active chat tab, but model identity is currently split
between profile defaults, session overrides, assistant-message metadata, and
component-local picker state. T70 establishes one effective identity for the
active tab and makes the picker and chip read from it.

## Effective Identity

```typescript
interface ActiveChatIdentity {
  sessionId: string;
  profileId: string | null;
  providerName: string;
  modelName: string;
}
```

Resolve the model in this order:

1. Explicit model override persisted on the active session.
2. The last assistant message's `modelName` for legacy/history sessions.
3. The selected provider profile's configured model.

The active session's profile remains the provider source for this task. Older
messages do not necessarily contain a separate provider/profile identifier, so
exact historical provider reconstruction is deliberately deferred.

## Ownership Rules

- `ChatApp` resolves the identity and owns the session override.
- `ModelSwitcher`, `ProfileIndicator`, and turn execution consume the same
  resolved identity; none maintains an authoritative selected model.
- Model selection changes only the active session override and recent-model
  record. Shared provider credentials and profile defaults are unchanged.
- Identity is recomputed after tab activation and asynchronous message loading.

## UI Contract

- The picker is a standard-size toolbar button containing only the model/chip
  icon and the count of active model assignments.
- The separate active chip shows provider and model name. It has no processor
  icon; the model name is slightly larger and purple.
- The searchable picker retains recent selections without duplicate full-list
  entries. Recents are stored once per provider and shared across credential
  profiles; available-model caches remain profile-specific. Its portal remains
  above chat content, is vertically viewport-safe, and exposes complete menu
  keyboard semantics.

## Verification Plan

- Unit-test all resolver precedence and missing-data cases.
- Integrate selection and chip updates through `ChatApp`.
- Switch between tabs with different historical models and shared profiles.
- Reopen a legacy session without an override and verify its last model.
- Verify the picker count/icon, chip styling, dimensions, recent list, portal,
  and keyboard behavior.

## Related History

- T35: completed per-tab profile/model foundation.
- T36: completed tab restoration and selection persistence hardening.
- T10: completed original model-discovery and picker UX.
- `settings-provider-design.md`: provider profile defaults and credential model.
- `past-session-search-and-tabs.md`: active-tab and session persistence contract.

## Implementation Checkpoint — 2026-09-02

- Added `resolveSessionProfileWithSource` and kept `resolveSessionProfile` as
  the compatibility helper. Resolution is explicit tab override first, then
  the latest applicable assistant `modelName`, then the profile default.
- `ChatApp` resolves the active tab's profile and passes the same resolved
  profiles through `ChatToolbar` → `ActionBar` → `ModelSwitcher`; turn
  execution consumes `resolvedProfile` instead of resolving independently.
- Group responses now persist `modelName` and carry it through temporary
  orchestrator context, allowing agent-specific legacy restoration.
- The model picker trigger now reuses `chat-btn chat-icon-btn`, so it shares
  dimensions with neighboring toolbar controls.
- Checkpoint verification: 51 test files / 446 tests, TypeScript, production
  build, and package build passed. Packaged-runtime verification was completed
  in the final closeout below.
- Recent-model behavior: the picker keeps 10 entries per provider. Activating
  a tab records its resolved model (including a legacy historical model) using
  the same de-duplication and provider-scoping helper as explicit selection.

## Final Implementation — 2026-09-02

- Recents now use provider keys as their canonical storage. Selecting a model
  or activating a tab updates the single ten-entry history for that provider,
  regardless of which credential profile is active.
- `normalizeSettings` migrates legacy profile-keyed histories into provider
  histories; import and sync merges apply the same normalization.
- `ModelSwitcher` reads only the provider history, while profile model caches
  remain isolated so model catalogues do not leak between credentials.
- Added unit, picker, and data-manager regression coverage for shared provider
  histories and legacy migration.
- Final validation passed: 52 test files / 451 tests, TypeScript, production
  build, formatting, and diff checks. The user verified toolbar appearance,
  tab/model restoration, shared Recents, search, and dropdown layering in the
  live Obsidian runtime.
- Final source commit: `72bf9f1fc33732b790f99e759e5f789024140a71`.
