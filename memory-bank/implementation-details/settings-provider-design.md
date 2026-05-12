# Settings & Provider Profile Design
*Created: 2026-05-02 11:46:39 IST*
*Last Updated: 2026-05-12 11:13:59 IST*

## Overview

The current settings screen is a single global configuration: one provider, one model, and one API key. The provider-profile design lets users keep multiple inference configurations and switch between them without rewriting credentials.

## Generated UI Reference

The generated UI/UX reference has been saved in the memory bank:

![Provider Profiles UI mockup](../assets/provider-profiles-ui-mockup.png)

Use this as the visual direction for the fuller settings experience: compact Obsidian-style settings navigation, profile controls, model refresh controls, chat defaults, and a diagnostics-oriented layout. The first implementation slice uses native Obsidian `Setting` rows rather than a custom React settings view.

## Current Limitation

```text
ObsidianAISettings
  provider: "openai" | "ollama" | "custom" | "gemini" | "azure"
  model: string
  apiKey?: string
  customURL?: string
  azureEndpoint?: string
  azureApiVersion?: string
```

Problems:

- Only one API key can be stored
- Provider-specific fields share one flat namespace
- Switching providers can leave stale model/API key combinations
- There is no connection validation before chat requests
- Chat, inline editing, and future features all depend on the same fragile tuple

## Target Settings Schema

```typescript
type ProviderType = "openai" | "ollama" | "custom" | "gemini" | "azure";

interface ProviderProfile {
  id: string;
  name: string;
  provider: ProviderType;
  model: string;
  apiKey?: string;
  customURL?: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  modelCache?: ModelCache;
  createdAt: number;
  updatedAt: number;
}

interface ObsidianAISettings {
  providerProfiles: ProviderProfile[];
  activeProviderProfileId: string;

  selectionPrompt: string;
  cursorPrompt: string;
  customCommands: SlashCommand[];
  commandPrefix: string;
  messageHistory: boolean;

  includeActiveNote: boolean;
  maxContextTokens: number;
  maxSavedConversations: number;
  debugLogLevel: "off" | "error" | "info" | "debug";
  debugLogRetention: number;
}
```

## Migration Flow

```text
loadSettings()
  |
  v
Does data.providerProfiles exist?
  |
  +-- yes --> merge with defaults
  |
  +-- no --> build first profile from legacy fields
             provider/model/apiKey/customURL/azureEndpoint/azureApiVersion
             |
             v
             activeProviderProfileId = generated profile id
```

## Settings UI

```text
+--------------------------------------------------+
| Provider Profiles                                |
|--------------------------------------------------|
| Active profile                                   |
| [Writing - OpenAI                         v]     |
| [New profile] [Duplicate] [Delete] [Test]        |
|                                                  |
| Name                                             |
| [Writing - OpenAI_________________________]      |
|                                                  |
| Provider                                         |
| [OpenAI                                  v]      |
|                                                  |
| API key                                          |
| [sk-************************************] [eye]  |
|                                                  |
| Model                                            |
| [gpt-4o-mini                            v]       |
|                                                  |
| Provider-specific fields                         |
|   Custom base URL      [https://..._______]      |
|   Azure endpoint       [https://..._______]      |
|   Azure API version    [2024-02-15-preview]      |
+--------------------------------------------------+
```

## Code Structure

```text
src/
  settings.ts
    ObsidianAISettings
    ProviderProfile
    DEFAULT_SETTINGS
    normalizeSettings()
    getActiveProviderProfile()
    ObsidianAISettingsTab

  api.ts
    ChatApiManager
      updateSettings(settings)
      initializeChatClient(activeProfile)
```

The first T9 implementation keeps provider-profile helpers in `settings.ts` to avoid adding a premature module boundary. A future refactor can extract them to `src/providers/providerProfile.ts` when model discovery and diagnostics expand the provider layer.

## Provider Resolution

```text
ChatApp / FloatingWidget
        |
        v
ChatApiManager.callApi() / callSelection() / streamChat()
        |
        v
getActiveProfile(settings)
        |
        v
initializeChatClient(profile)
        |
        +--> OpenAI profile
        +--> Ollama profile
        +--> Gemini profile
        +--> Azure OpenAI profile
        +--> Custom OpenAI-compatible profile
```

## Validation

The "Test connection" button should:

1. Validate required local fields
2. Initialize the provider client
3. Prefer a lightweight model-list or metadata request when available
4. Fall back to a tiny completion request only if needed
5. Report success/failure through `Notice` and debug logs

## Privacy Rules

- API keys are stored in plugin data like current settings
- API keys are never shown in debug logs
- Reveal/hide is local UI state only
- Exported logs redact endpoint query strings and credentials

## Open Questions

- Whether to support per-feature active profiles later, such as separate inline/chat profiles
- Whether to move API keys to a different storage strategy if Obsidian exposes a better secure-storage option

## Implementation Status

Completed on 2026-05-02 12:09:43 IST:

- Provider-profile settings schema
- Legacy flat-settings migration
- Active profile selector, create, duplicate, delete, rename, and test controls
- Provider-specific API key/custom/Azure fields
- Chat defaults for include-active-note, max saved conversations, and max context tokens
- `ChatApiManager` active-profile resolution
- `pnpm run build` verification

Enhanced on 2026-05-02 16:55:00 IST:

- Added universal endpoint field for all 9 providers with `getDefaultEndpoint()` fallback (not just custom/azure)

Refreshed on 2026-05-12 11:13:59 IST:

- Replaced the corrupted Settings panel with a cleaner sectioned layout in `src/settings.ts`
- Added a hero/header treatment and matching `styles.css` styling for the settings experience
- Restored guarded `display()` refresh behavior to avoid re-entrant loops while changing profiles
- Restored the cached-model fetch/search picker behavior for provider profiles
- Replaced the warning-style hero copy with a proper header after visual review
