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
