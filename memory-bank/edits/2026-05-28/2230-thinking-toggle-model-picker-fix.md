# Edit: 2026-05-28 Evening — Thinking Toggle Consolidation + Model Picker Fix + Input Bar Sizing

## Problem
- ChatInput had two thinking toggle buttons (🧠/💤 on left, 💭 on right) — confusing UX
- `thinkingEnabled` was NOT wired to actual LLM calls — toggling it had no effect on the model
- Messages were sent to `resolvedProfile` (settings default) even when user selected a different profile from the participant dropdown
- Input bar was too small (compact padding, small font)

## Changes

### 1. ChatInput.tsx — Remove duplicate thinking button
- Removed `showThinking` prop from interface
- Removed duplicate 💭 button from right side of input bar (send button area)
- Only the left-side 🧠/💤 toggle remains — controls `thinkingEnabled`

### 2. api.ts — Wire thinkingEnabled to LLM
- Added `getThinkingProviderOptions(profile, thinkingEnabled)` helper
  - DeepSeek: `{ deepseek: { reasoningEffort: "medium" } }`
  - OpenAI (o1/o3): `{ openai: { reasoningEffort: "medium" } }`
  - Anthropic (Claude 3.7): `{ anthropic: { thinking: { type: "enabled", budgetTokens: 12000 } } }`
- `streamChat()` and `streamChatWithTools()` now accept `thinkingEnabled?: boolean`
- Pass `providerOptions` to `streamText()` calls

### 3. AgentLoop.ts — Pass thinkingEnabled
- Added `thinkingEnabled?: boolean` to `AgentLoopOptions`
- Forwarded to `streamChatWithTools()` call

### 4. ChatApp.tsx — Fix model picker bug + wire thinkingEnabled
- `streamChat()` call: changed `resolvedProfile` → `activeProfile` (dropdown selection)
- `AgentLoop` instantiation: changed `resolvedProfile` → `activeProfile`
- Added `thinkingEnabled` to both `streamChat` and `AgentLoop`

### 5. styles.css — Bigger input bar
- `.chat-input-area`: padding 8px → 12px 14px, gap 6px → 8px
- `.chat-textarea`: padding 6px 8px → 10px 12px, font-size var(--font-ui-small) → var(--font-ui-medium), min-height 44px, line-height 1.4 → 1.5, border-radius 6px → 8px

## Commits
- `6e96212` — fix: use activeProfile instead of resolvedProfile for chat
- `2d4e53c` — feat(thinking): wire thinkingEnabled through to LLM calls + UI cleanup
- `f98ee22` — fix: ChatInput layout + attachment dropdown styles (earlier)

## Open Issue
- User reports messages still going to default model after fix. Possible causes:
  1. Plugin not rebuilt/reloaded in Obsidian (workspace copy ≠ canonical copy)
  2. User selecting via a different UI path than participant dropdown
  3. Build artifacts out of sync
- Next step: Verify which compiled `main.js` Obsidian is actually loading
