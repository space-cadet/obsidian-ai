---

## 0320-chatinput-ux-fixes.md

# ChatInput UI/UX Fixes — Layout Refactor, Edit Mode Restoration, Reasoning Bug

*Session: 2026-05-30 02:25–03:20 IST*
*Tasks: T19 (File Attachments), T22 (Component Decomposition)*
*Commits: `baf7b39`, `653d84b`, `8f6b94a`*

## What Changed

Fixed four UI/UX bugs and one API error in the ChatInput component and related files.

### 1. Reasoning Content Error with Kimi-k2.6 (Bug)
- **Problem**: `AI_APICallError: thinking is enabled but reasoning_content is missing` when using Kimi-k2.6 with tool calls enabled
- **Root cause**: Vercel AI SDK v6 OpenAI provider silently strips `type: "reasoning"` content parts when converting assistant messages. Kimi uses OpenAI-compatible API, so the API rejects requests missing reasoning content.
- **Fix**: `AgentLoop.ts` accumulates reasoning-delta events but does NOT include `{ type: "reasoning" }` in the assistant message content parts sent back to the LLM. Reasoning is captured for potential display but excluded from the conversation loop.
- **Files**: `src/agent/AgentLoop.ts`, `src/agent/types.ts`, `src/api.ts`
- **Status**: Partially fixed — still occurring in some edge cases. Needs deeper SDK investigation.

### 2. Edit Mode Input Bar Scrunched (Bug)
- **Problem**: When editing a message, the "Resubmit" and "Cancel" text buttons made the input bar tiny and crowded
- **Fix**: Replaced text-labeled buttons with icon-only compact buttons (▶ / ✕) using existing `chat-send-icon` class
- **Files**: `src/components/ChatInput.tsx`, `styles.css`

### 3. Button Crowding Around Input Bar (Bug)
- **Problem**: Buttons (📎, 🧠/💤, 📌) were too close to the textarea, causing visual crowding
- **Fix**: Moved all buttons except send/stop to a new toolbar row BELOW the textarea. Send button stays adjacent to textarea.
- **Files**: `src/components/ChatInput.tsx`, `styles.css`

### 4. Edit Mode Loses Attachments/Context Items (Bug)
- **Problem**: When editing a message that had inline attachments (e.g., `[[Learning Chinese]]`), the attachment metadata was lost and became plain text
- **Fix**: `handleEditMessage` in `useMessageActions.ts` now restores both `msg.attachments` and `msg.contextItems`. `handleCancelEdit` clears them. `handleSend` finally block clears `messageAttachments`.
- **Files**: `src/hooks/useMessageActions.ts`, `src/components/ChatInput.tsx`, `src/components/ChatApp.tsx`

### 5. Pin Current Button Removed (UX)
- **Problem**: The 📌 pin-current button was redundant since users can always use @mention to add any note
- **Fix**: Removed the pin button from ChatInput. Users should use @mention or [[wikilink]] for note references.
- **Files**: `src/components/ChatInput.tsx`, `src/components/ChatApp.tsx`

### 6. Press Enter to Send Setting (Feature)
- **Added**: New `pressEnterToSend: boolean` setting (default `true`) in `ObsidianAISettings`
- **UI**: Toggle in Settings → Chat Defaults: "Press Enter to send"
- **Behavior**: When enabled (default), Enter sends and Shift+Enter inserts newline. When disabled, Enter inserts newline and user must click send button.
- **Files**: `src/settings.ts`, `src/settings-sections/chatDefaults.ts`, `src/components/ChatInput.tsx`

## Layout Changes

**Before**:
```
[📌] [🧠] [textarea] [▶]
[📎]
```

**After**:
```
[textarea] [▶]
[📎 attach] [🧠 thinking] [attachment chips...]
```

## Files Changed
- `src/agent/AgentLoop.ts` — reasoning accumulation, exclude from message history
- `src/agent/types.ts` — added `reasoning-delta` to `StreamEvent`
- `src/api.ts` — handle `reasoning-delta` in `streamChatWithTools`
- `src/hooks/useMessageActions.ts` — restore/clear attachments and contextItems on edit
- `src/components/ChatInput.tsx` — layout refactor, remove pin button, add pressEnterToSend
- `src/components/ChatApp.tsx` — pass pressEnterToSend, remove pin button props
- `src/settings.ts` — add `pressEnterToSend` to interface and defaults
- `src/settings-sections/chatDefaults.ts` — add toggle UI
- `styles.css` — toolbar layout, attachment chip styling

## Verification
- Build: ✅ tsc + esbuild pass
- Tests: ✅ 52 tests pass
- Push: ✅ origin/main updated (commits `baf7b39`, `653d84b`, `8f6b94a`)

## Next Steps
- Deep investigation into Kimi-k2.6 reasoning bug (still occurring)
- User to test new ChatInput layout with real messages
- T22 Phase 4: extract handler hooks from ChatApp.tsx

---

---

## 1740-T19-attachment-fixes.md

# T19 Attachment Improvements — Token Counting, PDFs, External Files

*Session: 2026-05-29 17:07–17:43 IST*
*Task: T19 — File Attachments for Chat Messages*
*Commit: `eab64d3` — feat(T19): attachment improvements — token counting, PDF support, external files*

## What Changed

Three major improvements to the attachment feature:

### 1. Token Counting for Images/PDFs
- Added `estimateContentPartTokens()` and `estimateContentPartsTokens()` to `tokenEstimator.ts`
- Image estimate: ~255 tokens (OpenAI convention)
- PDF estimate: based on base64 byte size
- Moved attachment resolution BEFORE token computation in `useMessageActions.ts`
- Removed duplicate `resolveAttachments()` call

### 2. PDF Support for All Providers
- Expanded from Gemini-only to: OpenAI, Anthropic, OpenRouter, Gemini
- Vercel AI SDK v6 natively supports `FilePart` for these providers
- DeepSeek/Kimi still get placeholder text (SDK limitation)

### 3. External File Attachments
- Added `data?: string` and `mimeType?: string` to `Attachment` interface
- Added `createExternalAttachment()` to read File objects via FileReader API
- Added "📁 Browse External File" option in dropdown
- Added drag-and-drop support with visual feedback (`drag-over` CSS class)
- Supports images, PDFs, text files from OS filesystem

## Files Changed
- `src/context/tokenEstimator.ts`
- `src/hooks/useMessageActions.ts`
- `src/context/AttachmentEngine.ts`
- `src/types.ts`
- `src/components/ChatInput.tsx`
- `styles.css`

## Verification
- Build: ✅ tsc + esbuild pass
- Tests: ✅ 52 tests pass
- Push: ✅ origin/main updated

---

---

## 1430-T21-e2e-real-keys.md

# T21 E2E Tests with Real API Keys

*Session: 2026-05-29 14:00–14:35 IST*
*Task: T21 — Validate E2E tests with actual API keys*
*Commit: `33e8e9d` — feat(e2e): add OpenRouter multimodal test + fix Kimi default model*

## What Changed

Ran E2E tests with real API keys provided by user. Discovered and fixed two integration issues.

## Test Results

| Provider | Tests | Status | Notes |
|----------|-------|--------|-------|
| DeepSeek | 4 | ✅ Pass | Fast, reliable |
| OpenRouter | 3 | ✅ Pass | Image vision works |
| Kimi | 3 | ✅ Fixed | Model changed from `moonshot-v1-8k` to `kimi-k2.5` |
| Gemini | 1 | ⚠️ Discovery only | Quota exceeded for generation |
| OpenAI | 4 | ⏭️ Skipped | No key |
| Anthropic | 4 | ⏭️ Skipped | No key |

## Fixes Applied

### 1. Kimi Model Fix
- **Problem**: `moonshot-v1-8k` returns `engine_overloaded_error`
- **Fix**: Changed `getDefaultTestModel()` in `e2e/setup.ts` to use `kimi-k2.5`
- **Verification**: Streaming chat works (28.3s)

### 2. Gemini Model Update
- **Problem**: `gemini-1.5-flash-latest` was removed from API
- **Fix**: Changed to `gemini-2.0-flash`
- **Note**: Still fails due to quota exceeded (free tier limit reached)

### 3. OpenRouter Multimodal Test
- **Added**: Image vision test via OpenRouter (`google/gemini-2.0-flash-001`)
- **Result**: Passes in 1.6s — correctly describes 1×1 red PNG
- **Note**: OpenRouter model IDs require `-001` suffix for Gemini

## Files Changed

- `e2e/setup.ts` — Updated `getDefaultTestModel()` for Kimi and Gemini
- `e2e/multimodal.e2e.test.ts` — Added OpenRouter image vision test

## Next Steps

- Fix Gemini quota (user needs to upgrade billing)
- Add PDF test fixture (`e2e/fixtures/test.pdf`)
- Test with OpenAI/Anthropic keys when provided

---

## 1145-T21-e2e-test-suite.md

# T21 E2E Test Suite Implementation

*Session: 2026-05-29 11:15–11:46 IST*
*Task: T21 — CLI Test Harness for AI Features (evolved into E2E test suite)*
*Commit: `ddc25e0` — feat(e2e): add comprehensive LLM end-to-end test suite*

## What Changed

Instead of standalone CLI scripts, built a **Vitest-based E2E test suite** that runs via `pnpm test:e2e`. This integrates with existing test infrastructure and is CI-ready.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `vitest.e2e.config.ts` | 15 | E2E test config (Node env, 60s timeout) |
| `e2e/setup.ts` | 115 | Mock App, provider profile builder from env vars, conditional test helpers |
| `e2e/connection.e2e.test.ts` | 94 | API connection tests for 6 providers |
| `e2e/streaming.e2e.test.ts` | 230 | Streaming chat + tool calling (calculator tool) |
| `e2e/model-discovery.e2e.test.ts` | 98 | Model fetching tests for all providers |
| `e2e/multimodal.e2e.test.ts` | 117 | Image vision tests (Gemini, OpenAI, Anthropic) |
| `e2e/thinking.e2e.test.ts` | 60 | Reasoning mode tests (DeepSeek, Claude 3.7) |
| `.env.example` | 39 | Documents all required API keys |

## Files Modified

| File | Change |
|------|--------|
| `package.json` | Added `test:e2e` and `test:e2e:watch` scripts |
| `pnpm-lock.yaml` | Added `dotenv` dev dependency |
| `__mocks__/obsidian.ts` | Expanded with PluginSettingTab, Setting, Plugin, Vault, Workspace, MetadataCache, etc. |
| `memory-bank/tasks.md` | T21 marked ✅ COMPLETE |
| `memory-bank/tasks/T21.md` | Updated with full completion details |
| `memory-bank/activeContext.md` | Updated current focus and active tasks |

## Test Coverage

- **Connection**: `testApiConnection()` for all 6 providers with keys
- **Streaming**: `streamChat()` with simple prompts
- **Tool Calling**: `streamChatWithTools()` with calculator tool (zod schema)
- **Model Discovery**: `fetchModels()` for all providers
- **Multimodal**: Image vision with base64 1x1 PNG
- **Thinking**: Reasoning mode with `thinkingEnabled` flag

## Key Design Decisions

1. **Vitest over standalone scripts**: Integrates with existing test workflow, supports watch mode, coverage, CI.
2. **Conditional tests**: `describeIfProvider()` / `itIfProvider()` skip tests when API keys are missing.
3. **`.env` for keys**: `dotenv` loads `.env` file. Already gitignored. Never commit keys.
4. **Mock App**: Minimal `createMockApp()` provides enough Obsidian interface for `ChatApiManager` to work without real Obsidian runtime.
5. **Test timeout**: 60 seconds per test — LLM APIs can be slow.

## How to Run

```bash
cp .env.example .env
# Edit .env with your API keys

pnpm test:e2e      # run once
pnpm test:e2e:watch # watch mode
```

## Next Steps

- User needs to copy `.env.example` → `.env` and fill in API keys to actually run the tests.
- PDF tests require a real PDF file at `e2e/fixtures/test.pdf` — currently skipped.
- Web search tool tests could be added next (requires Brave/Tavily/Exa API keys).

---

## 100000-t23-completion.md

# Edit Chunk — 2026-05-29 10:00 IST

## Session
- **Start**: 2026-05-29 09:20 IST
- **End**: 2026-05-29 10:05 IST
- **Trigger**: User request
- **Duration**: ~45 minutes

## Actions

### 1. Fixed CI Build Failure (pre-existing)
- **Problem**: CI failed on `pnpm install --frozen-lockfile` due to outdated lockfile after commit `1d7a5e8` added testing library deps without updating `pnpm-lock.yaml`
- **Fix**: Ran `pnpm install` (with corecore pnpm v11.4.0) to regenerate lockfile
- **Commit**: `a0b113c` — "fix: regenerate pnpm-lock.yaml after test deps update"
- **Status**: CI now passes

### 2. T23 — Settings.ts Decomposition (COMPLETE)
- **Task**: Break down 1,187-line `settings.ts` into pure config + focused UI section files
- **Phase 1**: Extract `ObsidianAISettingsTab` to `src/settings-sections/SettingsTab.ts` (87 lines)
- **Phase 2**: Decompose into 8 section files:
  - `src/settings-sections/hero.ts` (45 lines) — hero banner with active profile info
  - `src/settings-sections/providerProfiles.ts` (35 lines) — React ProfileList mount
  - `src/settings-sections/chatDefaults.ts` (91 lines) — context, auto-name, limits
  - `src/settings-sections/agentTools.ts` (59 lines) — tools toggle, auto-apply, max steps
  - `src/settings-sections/webSearch.ts` (104 lines) — provider dropdown, API keys
  - `src/settings-sections/advanced.ts` (64 lines) — prompts, message history
  - `src/settings-sections/customCommands.ts` (81 lines) — slash command CRUD
  - `src/settings-sections/diagnostics.ts` (189 lines) — metrics, debug level, clear history
- **Phase 3**: Extract shared helpers to `src/settings-sections/helpers.ts` (46 lines) — `createSection`, `getProviderLabel`
- **Phase 4**: Keep `settings.ts` as pure config (341 lines, -846, -71%)
- **Phase 5**: Update `main.ts` import path; add backward compatibility re-export in `settings.ts`
- **Phase 6**: Removed dead code — `renderModelPicker` (unused private method, ~120 lines)
- **Verification**: `pnpm run build` ✅, `pnpm run test` ✅ (52 tests)
- **Commit**: `dbed5a5` — "refactor(T23): decompose settings.ts into section files"
- **Push**: `origin/main` updated

### 3. Memory Bank Update
- Updated `tasks.md`: T23 marked ✅ COMPLETE, added T22 to completed tasks
- Updated `tasks/T23.md`: Full completion details, decisions, verification criteria
- Updated `tasks.md` summary: Active 7, Paused 1, Completed 13
- **Commit**: `8f8dddc` — "docs(memory-bank): record T22 completion and T23 completion"

## Decisions
- Section functions receive `(containerEl, plugin, saveSettings, ...)` rather than class instance — keeps sections decoupled and testable
- `settings.ts` re-exports `ObsidianAISettingsTab` for backward compatibility; `main.ts` imports directly from canonical location
- `renderModelPicker` was dead code (private method, never called in `display()`) — removed entirely

## Git Commits
- `a0b113c` — fix: regenerate pnpm-lock.yaml after test deps update
- `dbed5a5` — refactor(T23): decompose settings.ts into section files
- `8f8dddc` — docs(memory-bank): record T22 completion and T23 completion

## Next Steps
- No more files over 1,000 lines in `src/`. Largest remaining: `ToolExecutor.ts` (865), `ProfileCard.tsx` (698), `api.ts` (689)
- T22 Phase 4 still pending: extract session/settings/export handlers from ChatApp.tsx


---

## 0718-session-fixes.md

# Edit Chunk: 2026-06-13 07:18 IST

*Session: 2026-06-13 07:09–07:35 IST*
*Tasks: Ad-hoc (not tied to specific task ID)*
*Commit: `44c1dc9`*

## Issues Addressed

1. **Mobile background execution** — Documented OS-level limitation in README.md
2. **@-mention folder regression** — Fixed folders not appearing when no query typed
3. **Token usage totals** — Added per-session total token display

## Changes

### Fix: @-mention folder visibility (ChatInput.tsx)

When typing `@` with no query, the dropdown only showed the first 10 candidates — which were always notes since notes are listed first. Folders and tags were invisible unless the user typed enough to filter down.

**Fix:** In `filteredCandidates` useMemo, when no query is present, return a balanced mix:
- First 7 notes
- First 5 folders  
- First 5 tags

Total: up to 17 items, scrollable within the 220px dropdown.

### Feature: Token usage totals

**Helper added:** `getSessionTotalTokens(session)` in `src/lib/sessionUtils.ts`
- Sums `estimatedTokens` across all messages in a session

**Display locations:**
1. **SessionPickerModal** — Each session row shows `~X tokens` next to message count
2. **ChatApp** — Running total below ChatInput: "~X tokens across Y messages"
3. **GroupChatApp** — Same running total below ChatInput

**CSS added:**
- `.chat-session-tokens` — muted style for token count in session picker
- `.chat-session-token-total` — right-aligned faint text below input

### Documentation: Mobile background execution (README.md)

Added "Mobile Notes" section explaining:
- Webview suspension when app goes to background (OS limitation, not plugin bug)
- What stops: LLM streams, tool calls, network requests, timers
- What persists: chat history, session state via local storage
- Recommendation: keep app in foreground for long operations
- Mobile-responsive UI features listed

## Files Changed

| File | Change |
|------|--------|
| `src/components/ChatInput.tsx` | Balanced candidate mix when no query |
| `src/lib/sessionUtils.ts` | `getSessionTotalTokens()` helper |
| `src/components/SessionPickerModal.tsx` | Token total in session meta line |
| `src/components/ChatApp.tsx` | Running total below ChatInput |
| `src/components/GroupChatApp.tsx` | Running total below ChatInput |
| `styles.css` | `.chat-session-tokens`, `.chat-session-token-total` |
| `README.md` | Mobile Notes section |

## Build Status

✅ `tsc -noEmit -skipLibCheck && esbuild` passes
