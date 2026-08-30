# CSS Selector Inventory — T66 Baseline

*Generated: 2026-08-30*
*Source: `styles.css` at commit `579252b`*
*Size: 5,064 lines, 101,533 bytes*

---

## Overview

| Metric | Count |
|---|---|
| Total selectors | 700 |
| `!important` declarations | 32 |
| Duplicate property declarations (same block) | 1 |
| Duplicate selectors (defined multiple times) | 45 |

---

## Selector Families by Feature Area

### 1. Chat (`chat-*`) — 324 selectors (46.3%)
**Files using these classes:**
- `src/components/ChatMessages.tsx`
- `src/components/MessageBubble.tsx`
- `src/components/ChatInput.tsx`
- `src/components/ChatApp.tsx`
- `src/components/ProfileCard.tsx`

**Sub-families:**
| Prefix | Count | Purpose |
|---|---|---|
| `chat-bubble*` | 45 | Message bubbles (user/assistant/error/streaming) |
| `chat-messages*` | 8 | Message list container |
| `chat-search-*` | 28 | Search UI |
| `chat-action-bar*` | 16 | Top action bar |
| `chat-profile-chip*` | 9 | Profile chip in action bar |
| `chat-textarea*` | 12 | Input textarea |
| `chat-session-*` | 42 | Session list/modal/tabs |
| `chat-context-*` | 4 | Context chips |
| `chat-typing-*` | 7 | Typing indicators |
| `chat-streaming-*` | 6 | Streaming state |
| `chat-scroll-*` | 4 | Scroll buttons |
| `chat-modal-*` | 24 | Modal dialogs |
| `chat-mention-*` | 6 | Mention dropdown |
| `chat-participant-*` | 12 | Participant bar |
| `chat-input-*` | 10 | Input row/area |
| `chat-send-*` | 4 | Send button |
| `chat-sync-panel*` | 10 | Sync panel |
| `chat-empty-*` | 2 | Empty states |
| Other `chat-*` | 65 | Various |

**Key finding:** `.chat-bubble-content` was missing — now added (see recent fix).

---

### 2. Sync (`sync-*`) — 129 selectors (18.4%)
**Files using these classes:**
- `src/sync/PluginFileSyncManager.ts`
- `src/sync/SyncEngine.ts`
- `src/components/ChatSyncPanel.tsx`
- `src/modals/SyncProgressModal.ts`
- `src/settings-sections/syncComponents.ts`
- `src/settings-sections/remoteStorageSettings.ts`

**Sub-families:**
| Prefix | Count | Purpose |
|---|---|---|
| `sync-v2-*` | 89 | Sync UI v2 (progress, pills, lists, counters) |
| `sync-progress-*` | 18 | Progress modal/animation |
| `sync-info*` | 4 | Info display |
| `sync-btn*` | 4 | Sync buttons |
| `sync-panel*` | 8 | Sync panel container |
| Other `sync-*` | 6 | Various |

**Key finding:** Many `sync-v2-*` selectors are defined twice — once in the main sync section (~L4113) and again in what appears to be a mobile/responsive or alternate context (~L4488). This suggests sync CSS grew organically and may have redundant blocks.

---

### 3. Settings (`obsidian-ai-settings*`) — 72 selectors (10.3%)
**Files using these classes:**
- `src/settings-sections/SettingsTab.ts`
- Various settings section files in `src/settings-sections/`

**Sub-families:**
| Prefix | Count | Purpose |
|---|---|---|
| `obsidian-ai-settings-hero*` | 16 | Hero/header section |
| `obsidian-ai-settings-section*` | 12 | Section cards |
| `obsidian-ai-settings-search*` | 8 | Search/filter |
| `obsidian-ai-settings-model*` | 10 | Model picker |
| `obsidian-ai-settings-metrics*` | 8 | Metrics display |
| `obsidian-ai-settings-version*` | 10 | Version info |
| Other `obsidian-ai-settings*` | 8 | Various |

**Key finding:** Several selectors defined twice (e.g., `.obsidian-ai-settings-search` at L131 and L152) — may be intentional cascade overrides or accidental duplication.

---

### 4. Tool Calls (`tool-call-*`) — 26 selectors (3.7%)
**Files using these classes:**
- `src/components/MessageBubble.tsx`
- `src/agent/tools.ts`

**Sub-families:**
| Prefix | Count | Purpose |
|---|---|---|
| `tool-call-notification*` | 8 | Notification container |
| `tool-call-header*` | 6 | Collapsible header |
| `tool-call-*` | 12 | Summary, detail, error, chevron |

---

### 5. Message Actions (`message-*`) — 17 selectors (2.4%)
**Files using these classes:**
- `src/components/ChatMessages.tsx`
- `src/hooks/useMessageActions.ts`

**Sub-families:**
| Prefix | Count | Purpose |
|---|---|---|
| `message-actions-wrapper` | 6 | Action wrapper (hover states) |
| `message-action-btn*` | 6 | Action buttons |
| `message-action-menu*` | 5 | More actions dropdown |

---

### 6. Updater (`updater-*`) — 5 selectors (0.7%)
**Files using these classes:**
- `src/updater/PluginUpdater.ts`

---

### 7. Utility / Editor — 3 selectors
- `.loader`, `.loader.hidden`, `.hidden`

### 8. State Utilities — 1 selector
- `.sr-only` (accessibility)

### 9. Other / Unclassified — 123 selectors (17.6%)
These are mostly CodeMirror overrides, tooltip styles, and general utility classes:
- `.cm-*` — CodeMirror cursor/tooltip/overlay (6)
- `.tooltip-*` — Autocomplete tooltip (5)
- `.submit-button`, `.primary-action` — Generic buttons (4)
- `.wide-text-settings` — Textarea sizing (2)
- `.completion-label` — Autocomplete (1)
- `.chat-*` selectors that don't fit above categories

---

## `!important` Usage Audit

**Total: 32 declarations**

| Line | Selector | Property | Notes |
|---|---|---|---|
| 7 | `.cm-cursor-overlay` | `background` | CodeMirror override |
| 10 | `.cm-cursor-overlay` | `border` | CodeMirror override |
| 56 | `.tooltip-button` | `box-shadow` | Button override |
| 111 | `.primary-action` | `background-color` | CTA button |
| 112 | `.primary-action` | `color` | CTA button |
| 116 | `.primary-action:hover` | `background-color` | CTA button |
| 432 | `.tooltip-autocomplete` | `background-color` | Obsidian override |
| 433 | `.tooltip-autocomplete` | `color` | Obsidian override |
| 434 | `.tooltip-autocomplete` | `width` | Positioning fix |
| 435 | `.tooltip-autocomplete` | `margin-left` | Positioning fix |
| 443 | `.tooltip-autocomplete li[aria-selected]` | `background-color` | Selection state |
| 444 | `.tooltip-autocomplete li[aria-selected]` | `color` | Selection state |
| 450 | `.completion-label` | `font-family` | Override |
| 1459 | `.chat-session-copy-select` | `padding` | Tab select |
| 1474 | `.chat-session-tab-select` | `padding` | Tab select |
| 1807 | `.message-actions-wrapper` (mobile) | `opacity` | Mobile always-show |
| 1814 | `.message-actions-wrapper` (small) | `opacity` | Small screen always-show |
| 2673 | `.chat-context-chip-active:hover` | `display` | Chip active state |
| 2680 | `.chat-icon-btn` | `width` | Button sizing |
| 3015 | `@media (max-width: 420px)` | `display` | Responsive hide |
| 3650 | `.chat-icon-btn.is-active` | `background` | Toggle button |
| 3651 | `.chat-icon-btn.is-active` | `color` | Toggle button |
| 3655 | `.chat-icon-btn.is-active:hover` | `background` | Toggle button |
| 3733 | `.chat-session-tab-select` | `text-align` | Override |
| 3734 | `.chat-session-tab-select` | `direction` | Override |
| 3735 | `.chat-session-tab-select` | `text-indent` | Override |
| 3736 | `.chat-session-tab-select` | `transform` | Override |
| 3743 | `.chat-session-tab-label` | `text-align` | Override |
| 3746 | `.chat-session-tab-label` | `direction` | Override |
| 4875 | `.updater-build-info` | `width` | Layout |
| 4968 | `@media` | `display` | Responsive hide |
| 4982 | `@media` | `display` | Responsive hide |

**Assessment:** Most `!important` usage is defensible — either overriding Obsidian's built-in styles (tooltip, autocomplete), forcing accessibility states, or mobile-specific overrides. The tab-select properties (L3733-3746) are heavy-handed but may be needed for RTL compatibility.

**Candidates for review:**
- `.chat-context-chip-active:hover` display override — could use specificity instead
- `.chat-icon-btn` width — may not need !important
- `.updater-build-info` width — layout should not need !important

---

## Duplicate Selector Analysis

**45 selectors defined multiple times.** Key groups:

### Intentional (likely responsive/contextual overrides):
- `.chat-messages` — L839 (base) and L921 (mobile)
- `.chat-textarea` — L1141 (base), L2975, L3003, L3261, L3295 (various contexts)
- `.chat-textarea:focus` — L1155 and L2992
- `.chat-context-chip` — L1106 and L3224
- Media queries at L425 and L3013

### Suspicious (possible accidental duplication):
- `.obsidian-ai-settings-search` — L131 and L152 (5-line gap)
- `.obsidian-ai-settings-section` — L286 and L4859 (far apart)
- `.obsidian-ai-settings-model-picker` — L327 and L412
- `.obsidian-ai-settings-metrics` — L381 and L416
- `.wide-text-settings` — L121 and L3876
- `.chat-profile-chip` — L716 and L780
- `.chat-profile-chip-name` — L744 and L771
- `.chat-profile-chip-model` — L752 and L767
- `.chat-session-title` — L1340 and L2142
- `.chat-mention-dropdown` — L1671 and L1743
- `.message-action-btn` — L1769 and L1785
- `.message-action-btn svg` — L1774 and L1807
- `.obsidian-ai-profile-col-name` — L2308 and L2490
- `.obsidian-ai-profile-col-actions` — L2332, L2498, and L3886 (3 times!)

### Sync section (extensive duplication):
- 34 sync-v2 selectors defined twice — appears to be two separate sync UI implementations or responsive variants

---

## Unsupported / Preview-Only CSS Features

| Feature | Location | Status |
|---|---|---|
| `attr(data-agent-color)` | L2821 | **Unsupported** — `css3-attr` used for border-left-color. Fallback: border-left is already `3px solid transparent` on L2817, but the color assignment via attr() likely fails silently in most browsers. Should use inline style or CSS custom property. |
| `text-indent` | L3735 | Used with `!important` in tab select. Not inherently unsupported, but the heavy override suggests fighting browser defaults. |
| `scrollbar-width` | L679, L3693 | Standard CSS, well-supported. `::-webkit-scrollbar` vendor prefixes also present. |

---

## Recommendations for T66 Implementation

### Phase 1: Documentation & Baseline (no code changes)
1. ✅ This inventory is the baseline.

### Phase 2: Quick Wins (low risk)
1. **Merge duplicate selectors** where declarations are identical or complementary:
   - `.obsidian-ai-settings-search` (L131 + L152)
   - `.chat-profile-chip`, `.chat-profile-chip-name`, `.chat-profile-chip-model`
   - `.message-action-btn` and `.message-action-btn svg`
2. **Remove unnecessary `!important`**:
   - `.chat-context-chip-active:hover` display
   - `.chat-icon-btn` width
   - `.updater-build-info` width
3. **Fix unsupported `attr()`** — replace L2821 with a data-attribute approach using CSS custom properties or inline styles

### Phase 3: Structural Reorganization
1. **Split into partials** by feature area:
   ```
   styles/
   ├── _base.css          (utility, editor, state)
   ├── _chat.css          (324 selectors — largest)
   ├── _settings.css      (72 selectors)
   ├── _sync.css          (129 selectors)
   ├── _tool-call.css     (26 selectors)
   ├── _message-actions.css (17 selectors)
   ├── _updater.css       (5 selectors)
   └── _profile.css       (profile card — check if separate)
   ```
2. **Build process** — concatenate in deterministic order via esbuild or simple `cat`
3. **Preserve** the root `styles.css` as the release artifact

### Phase 4: Verification
1. Run full test suite
2. Build production bundle
3. Screenshot comparison (desktop + mobile)
4. Community review re-check

---

## Related Files

- `memory-bank/tasks/T66.md` — Task definition
- `memory-bank/implementation-details/community-review-remediation.md` — Community review CSS findings
- `memory-bank/implementation-details/monolithic-files-audit-2026-08-30.md` — Size audit
