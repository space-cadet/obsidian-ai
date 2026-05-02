# AI SDK Migration: LangChain → Vercel AI SDK
*Created: 2026-05-02 12:23:54 IST*
*Last Updated: 2026-05-02 16:55:00 IST*

## Decision Record

**Status:** ✅ Implementation complete  
**Decided by:** Author (user) + Kimi Code CLI  
**Context:** During T9 completion, author requested adding OpenAI, Anthropic, DeepSeek, Kimi, Gemini, OpenRouter, and generic OpenAI-compatible providers. Evaluated LangChain vs Vercel AI SDK for provider coverage and architecture fit.

---

## Previous Stack (v1.2.4 – v2.0-pre)

The plugin originally used **LangChain JS** as its AI provider abstraction layer:

| Package | Version | Role |
|---|---|---|
| `@langchain/core` | ^0.3.16 | BaseMessage, `.invoke()`, `.stream()` |
| `@langchain/openai` | ^0.3.11 | OpenAI + Azure OpenAI clients |
| `@langchain/ollama` | ^0.1.1 | Ollama local client |
| `@langchain/google-genai` | ^0.2.1 | Google Gemini client |

**Provider types supported:** `openai`, `ollama`, `gemini`, `azure`, `custom`  
**Client initialization:** Per-provider `switch` statement in `ChatApiManager.initializeChatClient()`  
**Message format:** LangChain class instances — `new SystemMessage()`, `new HumanMessage()`, `new AIMessage()`  
**Streaming approach:** LangChain `.stream()` via async iterable chunks  
**Bundle size:** ~934KB `main.js`

---

## New Stack (v2.0+)

The plugin will use **Vercel AI SDK** as its AI provider abstraction layer:

| Package | Role |
|---|---|
| `ai` | Core `generateText()`, `streamText()`, `CoreMessage` types |
| `@ai-sdk/openai` | OpenAI, Azure (OpenAI-compatible), custom baseURL |
| `@ai-sdk/anthropic` | Claude (Anthropic) |
| `@ai-sdk/google` | Gemini (Google Generative AI) |
| `@ai-sdk/deepseek` | DeepSeek |
| `ollama-ai-provider` | Ollama (community provider) |
| `@openrouter/ai-sdk-provider` | OpenRouter (community provider) |

**Provider types supported:** `openai`, `ollama`, `gemini`, `azure`, `anthropic`, `deepseek`, `kimi`, `openrouter`, `custom`  
**Client initialization:** Unified `streamText({ model, messages, abortSignal })` — no per-provider switch  
**Message format:** Plain objects — `{ role: 'system' | 'user' | 'assistant', content: string }`  
**Streaming approach:** Native `streamText()` with built-in async iterable  
**Expected bundle size:** Significantly smaller (tree-shakeable, lighter deps)

---

## Why the Switch

1. **Streaming is first-class** — `streamText()` is designed for streaming from the ground up. LangChain's `.stream()` is bolted onto an abstraction-heavy framework.
2. **Smaller bundle** — Critical for an Obsidian plugin. Vercel AI SDK is tree-shakeable and much lighter than LangChain's dependency chain.
3. **Simpler message format** — Plain `{ role, content }` objects are easier to persist, debug, and transform than LangChain class instances.
4. **Unified API** — One `generateText()` / `streamText()` call regardless of provider. No more switch statements for client initialization.
5. **Provider coverage** — All requested providers (Anthropic, DeepSeek, OpenRouter) have dedicated `@ai-sdk/*` packages. Kimi works via OpenAI-compatible mode.

---

## What Changes

### Source Code

| File | Before (LangChain) | After (Vercel AI SDK) |
|---|---|---|
| `src/api.ts` | `ChatApiManager` with `initializeChatClient()` switch + `.invoke()` / `.stream()` | `ChatApiManager` with `generateText()` / `streamText()` + provider factory |
| `src/modules/messageHistory/queue.ts` | `HistoryMessage` = `HumanMessage \| AIMessage` | `HistoryMessage` = `{ role, content }` |
| `src/modules/AIExtension.ts` | LangChain message imports | Plain message objects |
| `package.json` | `@langchain/core`, `@langchain/openai`, `@langchain/ollama`, `@langchain/google-genai` | `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/deepseek`, `ollama-ai-provider`, `@openrouter/ai-sdk-provider` |

### Architecture

| Aspect | Before | After |
|---|---|---|
| Inline tooltip (`callSelection`) | `.invoke([SystemMessage, HumanMessage])` blocking | `generateText({ system, messages })` blocking |
| Chat panel (`streamChat`) | `.stream([SystemMessage, HumanMessage, AIMessage, ...])` | `streamText({ model, messages, abortSignal })` |
| Message history storage | LangChain class instances serialized | Plain `CoreMessage[]` serialized |
| Provider switch logic | 5-case switch in `initializeChatClient()` | Provider factory function selected by `profile.provider` |

---

## Migration Scope

### Tasks Updated
- **T4** — Rewritten from "LangChain Streaming" to "Vercel AI SDK Streaming"
- **T2** — `buildLangChainMessages()` renamed to `buildMessages()`
- **T6** — `buildLangChainMessages()` renamed to `buildMessages()`

### Docs Updated
- `techContext.md` — Stack table and architecture diagrams
- `systemPatterns.md` — Pattern 4 (AI Provider), Pattern 5 (Context Assembly)
- `projectbrief.md` — Tech stack description
- `tasks.md` — Task descriptions
- `current-architecture.md` — Provider class table and data flow
- `proposed-architecture.md` — Streaming flow and message formats
- `chat-panel-design.md` — `streamChat()` implementation sketch
- `context-system-design.md` — Message terminology
- `settings-provider-design.md` — Provider resolution diagram

### Docs Created
- This file (`ai-sdk-migration.md`)

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Inline tooltip regression | Migrate `callApi()` carefully; keep blocking `generateText()` path identical in behaviour to `.invoke()` |
| Ollama streaming breaks | `ollama-ai-provider` is community-maintained; test thoroughly before release |
| Bundle size unexpectedly large | Monitor `main.js` size after build; Vercel SDK is designed to be small but verify |
| Message history format incompatibility | `MessageQueue` is UI-only (arrow-key nav); doesn't affect persisted data. ConversationManager (T2) will use the new format from day one. |

---

## Historical Note

The LangChain-based architecture served the plugin well from v1.0 through v1.2.4. It provided a working inline-editing experience with OpenAI, Ollama, Gemini, Azure, and custom endpoints. The switch to Vercel AI SDK is a v2.0 architectural decision made to enable streaming, reduce bundle size, and support a broader provider ecosystem. The original LangChain implementation is preserved in git history (commits up to `6377383`).

## Implementation Completion (2026-05-02 16:55:00 IST)

**Completed:**
- All `@langchain/*` dependencies removed
- `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/deepseek`, `@openrouter/ai-sdk-provider` installed
- `ChatApiManager` rewritten with `generateText()`, `streamText()`, and unified `createLanguageModel()` factory
- 9 providers configured: openai, anthropic, deepseek, kimi, gemini, openrouter, azure, ollama, custom
- `fetchModels()` added to `ChatApiManager` for provider-specific model discovery
- `testApiConnection()` added with real API pings and specific error messages per status code
- Kimi 401 fixed by correcting base URL to `https://api.moonshot.ai/v1`
- Ollama handled via OpenAI-compatible endpoint to avoid `ollama-ai-provider` V1 incompatibility
- Build verified: `pnpm run build` passed, prettier clean

**Remaining:**
- Wire `streamChat()` into React components (ChatApp.tsx, ChatInput.tsx, ChatMessages.tsx)
- Implement Stop button with AbortController lifecycle
- Handle abort and error UI states
- Manual streaming test across all 9 providers
