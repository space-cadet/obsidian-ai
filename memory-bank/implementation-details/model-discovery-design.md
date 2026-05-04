# Model Discovery & Picker Design
*Created: 2026-05-02 11:46:39 IST*
*Last Updated: 2026-05-04 22:46:16 IST*

## Overview

Users should not have to memorize model IDs. Model discovery fetches available models for the active provider profile, caches the result, and displays a searchable picker with manual-entry fallback.

## UX Flow

```text
User opens Settings
        |
        v
Active provider profile selected
        |
        v
Model row renders cached model if present
        |
        +-- cache exists --> searchable picker enabled
        |
        +-- no cache -----> [Refresh models] call-to-action
        |
        v
User refreshes models
        |
        v
ModelDiscoveryService.listModels(profile)
        |
        +-- success --> cache models, show picker
        |
        +-- failure --> show error + manual entry
```

## Picker Layout

```text
+--------------------------------------------------+
| Model                                            |
| [ gpt-4o-mini                         v] [sync] |
+--------------------------------------------------+
| Search models                                    |
| [gpt____________________________________]        |
|--------------------------------------------------|
| * gpt-4o-mini                         chat      |
|   gpt-4o                              chat      |
|   gpt-4.1                             chat      |
|   text-embedding-3-large              embedding |
|--------------------------------------------------|
| Last refreshed: 2026-05-02 11:46:39 IST         |
| Could not find a model?                          |
| [manual-model-name_____________________] [Use]   |
+--------------------------------------------------+
```

## Model Data Shape

```typescript
interface ModelInfo {
  id: string;
  label?: string;
  provider: ProviderType;
  capabilities?: Array<"chat" | "embedding" | "vision" | "reasoning">;
  contextWindow?: number;
  source: "remote" | "static" | "manual";
}

interface ModelCache {
  models: ModelInfo[];
  fetchedAt: number;
  error?: string;
}
```

## Service Structure

```text
src/models/
  types.ts
  modelDiscoveryService.ts
    listModels(profile)
    refreshModels(profile)
    mergeStaticDefaults(provider, remoteModels)
    isCacheFresh(cache)

  providers/
    openAICompatibleModels.ts
      fetchOpenAICompatibleModels(baseURL, apiKey)

    ollamaModels.ts
      fetchOllamaModels(baseURL?)

    geminiModels.ts
      fetchGeminiModels(apiKey)

    azureModels.ts
      fetchAzureDeployments(profile)
```

## Provider Fetch Strategy

```text
OpenAI / custom
  GET {baseURL}/models
  Authorization: Bearer <apiKey>

Ollama
  GET http://localhost:11434/api/tags
  no API key by default

Gemini
  GET https://generativelanguage.googleapis.com/v1beta/models?key=<apiKey>

Azure
  Prefer deployment listing if supported by configured endpoint
  Otherwise require manual deployment name
```

## Component Structure

```text
SettingsTab
  |
  +-- ProviderProfileSection
        |
        +-- ProviderProfileSelector
        +-- ProviderFields
        +-- ModelPicker
              |
              +-- ModelSearchInput
              +-- ModelResultList
              +-- ManualModelInput
              +-- RefreshModelButton
```

## Error States

```text
Loading:
  "Fetching models..."

Empty:
  "No models returned. Enter a model name manually."

Auth error:
  "Could not fetch models. Check this profile's API key."

Network error:
  "Could not reach provider. Use a manual model name or try again."
```

## Rules

- Manual model entry must always remain available
- The selected manual model should be stored even if it is not in cache
- Discovery failures should not break existing chat or inline editing
- Cached model lists are per provider profile, not global
- Long model lists must be searchable and scrollable

## Implementation Status (2026-05-04 22:46:16 IST)

Model discovery is fully implemented:

- Provider-specific fetchers in `src/api.ts` (`fetchProviderModels`) for all 9 providers
- `ModelCache` stored on `ProviderProfile` with `models[]` and `fetchedAt` timestamp
- Inline searchable model list in settings (replaced modal picker): search input + scrollable results + click-to-select
- Cache invalidated when provider, API key, endpoint, or API version changes
- Manual model entry always available via search input
- Error handling with Notice messages on fetch failure

**Deferred (not required for v1):**
- Model metadata display (capabilities, context window) — cache stores plain strings, not `ModelInfo` objects
- Separate `modelDiscoveryService.ts` layer — fetch logic lives directly in `src/api.ts`
