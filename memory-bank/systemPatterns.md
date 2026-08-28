# System Patterns: Obsidian AI Plugin
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 11:46:39 IST*

## Core Principles

1. **KIRSS**: Keep It Really Simple, Stupid — prefer simple solutions, avoid over-engineering
2. **Explicit Approval**: No file modifications, feature additions, or code generation without user approval
3. **Incremental Progress**: Small, validated steps; go slow and steady
4. **Non-Destructive**: Nothing changes in a note until the user explicitly accepts a diff
5. **Obsidian-First**: Follow Obsidian plugin conventions and API patterns
6. **Reuse Before Build**: Prefer dispatching existing effects over reimplementing diff logic

---

## Pattern 1: CodeMirror 6 Extension Pipeline

All inline editor integrations use the CM6 extension system:

- **StateField**: per-editor state (e.g. `generatedResponseState`, `currentSelectionState`)
- **StateEffect**: typed events that mutate state (e.g. `commandEffect`, `acceptTooltipEffect`)
- **ViewPlugin**: react to view changes (e.g. `focusGuardPlugin`, `applyDiffPlugin`)
- **Decoration / WidgetType**: visual markers (e.g. diff spans, floating tooltip)

Extensions registered once via `plugin.registerEditorExtension([...])` in `onload()`.

```
commandEffect → FloatingTooltipState → FloatingWidget
                                            │
                                     submitAction()
                                            │
                                   setGeneratedResponseEffect
                                            │
                                    diffDecorationState → ChangeContentWidget
                                            │
                              acceptTooltipEffect / dismissTooltipEffect
                                            │
                                    applyDiffPlugin / clear
```

---

## Pattern 2: Two-Surface Architecture (v2.0)

```
┌─────────────────────────────────────────────────────────┐
│  Surface 1: Inline Tooltip          Surface 2: Chat     │
│  (CodeMirror WidgetType)            (Obsidian ItemView) │
│                                                         │
│  Ctrl+K → FloatingWidget            Ribbon → ChatPanel  │
│  Single-turn transform              Multi-turn chat     │
│  Inline diff in editor              Sidebar conversation│
│                                     + Apply to Note     │
│                ▼                              ▼         │
│           ChatApiManager.callSelection()  .streamChat() │
│                                                         │
│                     ▼       ▼                           │
│             diffExtension  NoteEditingBridge            │
│                    (shared CM6 effects)                 │
└─────────────────────────────────────────────────────────┘
```

Both surfaces share `ChatApiManager` and all CM6 state effects. Neither modifies the other.

---

## Pattern 3: NoteEditingBridge — Effect Dispatch Only

`NoteEditingBridge` is a pure connector. It never reimplements diff logic. Its entire job:

1. Ensure the target note is open in a leaf
2. Get the `EditorView` for that leaf
3. Dispatch `setSelectionInfoEffect` (what range to replace)
4. Dispatch `setGeneratedResponseEffect` (what AI text to show)

Then `diffDecorationState`, `ChangeContentWidget`, `applyDiffPlugin` do the rest — unchanged.

```
NoteEditingBridge
  .applyToTargetNote(notePath, aiText, range)
        │
        ├── openNoteInWorkspace(app, notePath)
        ├── getEditorViewForNote(app, notePath)
        ├── dispatch(setSelectionInfoEffect({ from, to, text }))
        └── dispatch(setGeneratedResponseEffect({ airesponse, prompt }))
                        │
                        ▼
              [existing diffExtension handles everything else]
```

---

## Pattern 4: AI Provider Pattern

`ChatApiManager` is the single point of contact for AI calls:

- **v1 (inline)**: `callSelection()` → `callApi()` → `.invoke()` (blocking)
- **v2 (chat)**: `streamChat()` → `.stream()` (async iterable chunks)

Provider selected from the active provider profile; same `chatClient` used by both methods.

```text
ObsidianAISettings
  providerProfiles[]
  activeProviderProfileId
        |
        v
ProviderProfileService.getActiveProfile()
        |
        v
ChatApiManager.initializeChatClient(profile)
        |
        +--> inline tooltip calls
        +--> chat panel calls
```

---

## Pattern 5: Context Assembly

Context always assembled as XML blocks before the user message:

```
<context>
  <note name="{{title}}">{{content}}</note>
  <active-note name="{{title}}">{{content}}</active-note>
  <selection>{{text}}</selection>
</context>

{{userMessage}}
```

LLM sees a single `HumanMessage` with context prepended. System prompt is separate (`SystemMessage`). Prior turns are the full `[HumanMessage, AIMessage, ...]` history array.

---

## Pattern 6: React in Obsidian ItemView

```typescript
class ObsidianAIChatView extends ItemView {
  private root: ReactDOM.Root | null = null;

  async onOpen() {
    this.root = ReactDOM.createRoot(this.containerEl.children[1]);
    this.root.render(<ChatApp plugin={this.plugin} />);
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }
}
```

React is bundled into `main.js` by esbuild — no separate chunk. State lives in React component state and `ConversationManager`; not in CM6 StateFields.

---

## Pattern 7: Settings Pattern

- All configurable values in `ObsidianAISettings` interface (`settings.ts`)
- `DEFAULT_SETTINGS` provides fallbacks
- Settings tab (`ObsidianAISettingsTab`) mutates `plugin.settings` and calls `saveSettings()`
- Provider credentials live in `providerProfiles[]`
- `activeProviderProfileId` determines the provider/model used by inline and chat calls
- Legacy flat settings migrate into the first provider profile
- v2.0 settings additions: `includeActiveNote`, `maxContextTokens`, `maxSavedConversations`, `debugLogLevel`, `debugLogRetention`

## Pattern 8: Model Discovery Pattern

Model discovery is provider-aware and cache-backed. Manual model entry remains available for unsupported providers or temporary API failures.

```text
ProviderProfile
  |
  v
ModelDiscoveryService.refreshModels(profile)
  |
  +-- OpenAI/custom: GET /models
  +-- Ollama: GET /api/tags
  +-- Gemini: GET /models
  +-- Azure: deployment list or manual fallback
  |
  v
profile.modelCache
  |
  v
Searchable ModelPicker
```

## Pattern 9: Debug Logging Pattern

Feature modules emit redacted diagnostic events to a bounded log service. Logs are visible in-app and copyable for support.

```text
Provider/chat/context/model code
        |
        v
DebugLogService.add(event)
        |
        +-- redact secrets and prompt/note contents
        +-- keep bounded ring buffer
        +-- persist to plugin data
        +-- optional console output
```

## Pattern 10: Chat Guidance Pattern

The chat panel teaches features through stateful empty states and tips, not a separate tutorial page.

```text
ChatApp state
  |
  +-- provider incomplete --> SetupWarning
  +-- no messages ---------> ChatEmptyState examples
  +-- no context ----------> ContextBar hint
  +-- context attached ----> Context chips and token estimate
```

---

## Memory Bank Update Protocol

When updating memory bank files:
1. Always update `*Last Updated: YYYY-MM-DD HH:MM:SS IST*` at the top
2. Add an entry to `edit_history.md` (newest first)
3. Update `activeContext.md` to reflect current focus
4. Update `tasks.md` and `progress.md` as tasks change state
5. Update `session_cache.md` at the end of each session
6. Never delete session files — append-only history

---

## Versioning Convention

**Release versions:** SemVer (`MAJOR.MINOR.PATCH`)
- `1.4.0` — clean release (no prerelease suffix)
- Obsidian release tag must exactly match manifest version, without `v` prefix

**Dev builds:** `{NEXT_VERSION}-{BRANCH_TAG}.{SHORT_SHA}`
- `main` → `1.4.0-dev.5db4e1d`
- `feat/t46` → `1.4.0-feat-t46.5db4e1d`
- `hotfix/x` → `1.4.0-hotfix-x.5db4e1d`
- `release/x` → `1.4.0-rc.5db4e1d`

**Build script:**
```bash
VERSION="1.4.0"
SHA=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD | sed 's/\//-/g')

if [ "$BRANCH" = "main" ]; then
    TAG="dev"
elif [[ "$BRANCH" == release/* ]]; then
    TAG="rc"
else
    TAG="${BRANCH}"
fi

echo "${VERSION}-${TAG}.${SHA}"
```

**Bumping rules:**
- `main` manifest stays at last release version until release decision
- Dev versions computed at build time, not committed to repo
- Release: bump manifest, commit, tag, build

---

## Timestamp Format

All timestamps use: `YYYY-MM-DD HH:MM:SS IST`
Example: `2026-05-02 08:13:57 IST`

## Task Status Indicators

- 🔄 In Progress
- ✅ Completed
- ⏸️ Paused
- ❌ Cancelled
- ⬜ Not Started

## File Naming Conventions

- Task files: `tasks/T{N}.md` (e.g. T1.md, T2.md)
- Session files: `sessions/YYYY-MM-DD-{period}.md` (e.g. 2026-05-02-morning.md)
- Edit chunks: `edits/YYYY-MM-DD/{HHMMSS}-{id}.md`
- Implementation docs: `implementation-details/{kebab-name}.md`
