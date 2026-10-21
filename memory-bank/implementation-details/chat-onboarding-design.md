# Chat Onboarding, Tips & Empty States Design
*Created: 2026-05-02 11:46:39 IST*
*Last Updated: 2026-05-02 11:46:39 IST*

## Overview

The chat panel should teach users what it can do at the moment they need it. Guidance should be concise, contextual, and honest about implemented features.

## Empty Chat State

On a fresh installation, the empty chat view shows the bundled light-themed
Chat Lab AI assembly-line artwork once. The seen flag is persisted in plugin
data; existing installations without the flag are treated as having already
seen it. Showing the splash sets the flag immediately. There is no dismiss
button: it remains in the current empty chat until the first message, and later
loads use the standard empty-chat prompt. The v1.8.0 image is stored at
`assets/chat-lab-splash-v1.8.0.png` and is resolved from the installed plugin
directory. The earlier example-prompt cards and contextual tips described
below remain future work.

## Setup Warning State

```text
+--------------------------------------------------+
| Provider setup needed                            |
| Add an API key or choose a local Ollama model    |
| before starting a chat.                          |
|                                                  |
| [Open settings]                                  |
+--------------------------------------------------+
```

## Context Bar States

```text
No context:
  Context: none attached     [+ Add note] [Include active note]

With context:
  Context: [@Project Notes x] [Active note x]  ~1,840 tokens

Truncated:
  Context: [@Project Notes x]  ~7,900 / 8,000 tokens  [truncated]
```

## Component Structure

```text
ChatApp
  |
  +-- ActionBar
  |
  +-- ChatMessages
  |     |
  |     +-- ChatEmptyState
  |     |     +-- ExamplePromptButton
  |     |     +-- FirstRunTip
  |     |
  |     +-- MessageBubble
  |
  +-- ContextBar
  |     |
  |     +-- ContextChip
  |     +-- ContextEmptyState
  |     +-- ContextWarning
  |
  +-- ChatInput
        |
        +-- SetupWarning
        +-- MentionHint
        +-- SendButton
```

## Tip Timing

```text
First open:
  show empty state + setup status

Provider incomplete:
  show setup warning above input

No context attached:
  show short "Attach notes with @" hint

After first assistant message:
  show copy/apply affordances, no tutorial card

After T5 apply-to-note exists:
  show one-time "Apply responses to notes as diffs" tip
```

## Copy Guidelines

- Prefer action-oriented text: "Attach a note" instead of "Context system"
- Keep tips one sentence
- Do not mention unimplemented features
- Avoid clutter once messages exist
- Let users dismiss first-run guidance

## Styling Constraints

- Empty state should fit narrow right sidebars
- Example prompts should wrap cleanly
- Avoid large marketing-style hero layout inside the plugin pane
- Keep text sizes compact and consistent with Obsidian settings/plugin UI

## Implementation Notes

T12 should be implemented after T9 so provider readiness can be computed accurately. Tips for context and apply-to-note should be gated by T3 and T5 feature availability.
