# E2E Test Results: Real API Key Validation

*Session: 2026-05-29 afternoon*
*Commit: 33e8e9d*

## What Was Done

Ran E2E tests with real API keys for all configured providers. Discovered and fixed two issues:

### 1. Kimi Integration Broken → Fixed ✅

**Problem**: `moonshot-v1-8k` returns `engine_overloaded_error` from Kimi API.

**Evidence**:
```bash
curl https://api.moonshot.ai/v1/chat/completions -d '{"model":"moonshot-v1-8k",...}'
# → {"error":{"type":"engine_overloaded_error"}}
```

**Fix**: Changed default test model from `moonshot-v1-8k` → `kimi-k2.5`
- File: `e2e/setup.ts` function `getDefaultTestModel()`
- Result: Kimi streaming chat now works (28.3s response time)

### 2. Gemini Model Removed → Fixed ✅

**Problem**: `gemini-1.5-flash-latest` was removed from Google API, causing model discovery to fail.

**Fix**: Changed default to `gemini-2.0-flash`
- File: `e2e/setup.ts` function `getDefaultTestModel()`
- Note: Gemini still fails due to **quota exceeded** (free tier limit reached)

### 3. OpenRouter Multimodal Added ✅

**What**: Added image vision test through OpenRouter (since user uses OpenRouter for Gemini).

**Model**: `google/gemini-2.0-flash-001` (note: `-001` suffix required on OpenRouter)

**Result**: Test passes in 1.6s — correctly describes 1×1 red PNG image.

## Test Results Summary

| Provider | Tests | Status | Notes |
|----------|-------|--------|-------|
| DeepSeek | 4 | ✅ All pass | Fast, reliable |
| OpenRouter | 3 | ✅ All pass | Image vision works |
| Kimi | 3 | ✅ Fixed | `kimi-k2.5` model works |
| Gemini | 1 | ⚠️ Discovery only | Quota exceeded for generation |
| OpenAI | 4 | ⏭️ Skipped | No key |
| Anthropic | 4 | ⏭️ Skipped | No key |

## Files Changed

- `e2e/setup.ts` — Updated `getDefaultTestModel()` for Kimi and Gemini
- `e2e/multimodal.e2e.test.ts` — Added OpenRouter image vision test

## Remaining Work

- Gemini quota: User needs to upgrade billing or wait for free tier reset
- PDF test: Needs `e2e/fixtures/test.pdf` + working Gemini or other provider
- OpenAI/Anthropic: Need keys to test native image vision
