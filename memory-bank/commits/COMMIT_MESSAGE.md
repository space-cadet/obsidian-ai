(docs)META-1: Memory bank sync for T4 migration, T9 completion, T10-T12 creation

Sync memory bank state with the current implementation after the Vercel AI SDK migration and provider-profile work.

Details
- Updated `memory-bank/tasks.md` — added T9 (✅), T10 (⏸️), T11 (⏸️), T12 (⏸️); updated T4 status to 🔄; updated summary counts to Active: 3, Paused: 3, Completed: 3
- Updated `memory-bank/tasks/T4.md` — status changed to 🔄 IN PROGRESS; marked provider-layer criteria (streamChat, 9 providers) complete; updated remaining work to chat-panel UI wiring
- Updated `memory-bank/tasks/META-1.md` — recorded T9–T12 creation and new implementation docs in progress log
- Updated `memory-bank/tasks/T1.md` — added T9 as completed dependency
- Updated `memory-bank/session_cache.md` — synced task registry with T9 completion and T4 primary focus
- Updated `memory-bank/edit_history.md` — appended mem-update entry with all file changes
- Created `memory-bank/edits/2026-05-02/174845-mem-update.md` — canonical edit chunk for this sync

Known issues / follow-ups
- T4 chat-panel UI wiring (Stop button, AbortController, error states) still pending implementation
- T8 final review remains open
- T10, T11, T12 implementation queued behind T4

Status
(85% complete — memory bank records aligned; remaining 15% is T4 UI wiring + T8 review)

---

(feat)T9,T4: Migrate to Vercel AI SDK, add provider profiles, and streaming foundation

Replace LangChain with Vercel AI SDK across the provider layer, introduce provider profiles for multi-endpoint support, and lay the streaming groundwork for the chat panel.

Details
- Migrated `src/api.ts` from LangChain to Vercel AI SDK — replaced `.invoke()` / `.stream()` with `generateText()` / `streamText()` via unified `createLanguageModel()` factory
- Expanded provider support from 5 to 9 providers: openai, anthropic, deepseek, kimi, gemini, openrouter, azure, ollama, custom
- Added `validateProfile()` and per-provider credential validation with Notice-based error feedback
- Added `fetchModels()` and `testApiConnection()` to ChatApiManager for model discovery and connectivity testing
- Replaced flat settings with provider-profile architecture in `src/settings.ts` — `ProviderProfile`, `ModelCache`, legacy migration via `normalizeSettings()`
- Added profile management UI: create, duplicate, delete, select active, and test connection from settings tab
- Added fetch-models trigger and searchable model picker shell in settings UI (T10 foundation)
- Updated `src/main.ts` to use `normalizeSettings()` for backward-compatible legacy settings migration
- Replaced `@langchain/*` deps with `ai`, `@ai-sdk/*`, `@openrouter/ai-sdk-provider`, `ollama-ai-provider`; removed `package-lock.json` in favor of `pnpm-lock.yaml`

Known issues / follow-ups
- T4 chat-panel React components still need to consume `streamChat()` directly
- Stop button AbortController lifecycle not yet wired in ChatApp/ChatInput/ChatMessages
- Manual streaming test across all 9 providers pending
- Model discovery service layer (T10) needs provider-specific fetchers and cache refresh logic

Status
(60% complete — provider layer and settings UI done; remaining 40% is chat-panel streaming wiring + provider testing)
