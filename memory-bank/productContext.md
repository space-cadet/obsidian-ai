# Product Context: Obsidian AI Plugin
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 08:13:57 IST*

## Problem Statement

Obsidian users who want AI-assisted writing must either:
1. Leave their editor entirely to use external AI tools (ChatGPT, Claude.ai), or
2. Use a plugin like Copilot that keeps AI responses locked inside a chat panel — separate from the notes being worked on.

Obsidian AI v1.2.4 solved problem 1 for quick single-shot transforms but has no chat interface. The v2.0 roadmap solves both: a persistent chat panel *plus* the ability to push AI responses directly into notes, with the same familiar diff + accept/discard UX.

---

## Target Users

- **Knowledge workers** using Obsidian for notes, writing, and research
- **Writers** who want to discuss and refine content with AI without leaving their vault
- **Developers** using Obsidian for documentation who want local/private model support
- **Power users** who want `@mention` context injection and in-place editing, not just chat replies

---

## User Experience Goals

1. **Conversation first**: discuss changes with AI before applying them
2. **Apply anywhere**: push AI responses into any note, not just the chat
3. **Minimal friction**: `@note` to add context; one button to apply to note
4. **Familiar diff UX**: the same accept/discard flow already in v1.2.4
5. **Privacy**: local models via Ollama remain first-class
6. **Non-destructive**: nothing changes in a note until the user accepts the diff

---

## Current User Flows (v1.2.4)

### Flow 1: Quick Inline Transform
1. Select text in editor
2. Press `Ctrl+K`
3. Floating tooltip appears at cursor
4. Type transform instruction (or `/custom-command`)
5. AI response shown as inline diff
6. Accept or Discard

### Flow 2: Cursor Generation
1. Place cursor (no selection)
2. Press `Ctrl+K`
3. Type generation prompt
4. AI content shown as diff at cursor
5. Accept or Discard

---

## Proposed User Flows (v2.0)

### Flow 3: Chat + Apply to Note
```
┌─────────────────────────────────────┐
│ You: @[[Project Notes]]             │
│ Rewrite the introduction to be      │
│ more concise and impactful.         │
├─────────────────────────────────────┤
│ Obsidian AI: Here's a rewritten intro: │
│                                     │
│   # Project Notes                   │
│   Obsidian AI brings AI-powered...     │
│                                     │
│ [✓ Apply to Project Notes] [⎘ Copy] │
└─────────────────────────────────────┘
         │
         ▼  user clicks Apply
┌──────────────────────────────┐
│ Project Notes.md (in editor) │
│                              │
│ ~~Old intro text~~ [removed] │
│ [added] New intro text       │
│                              │
│    [✓ Accept]  [✗ Discard]   │
└──────────────────────────────┘
```

### Flow 4: Create Note from Chat
```
User: /create [[Meeting Summary]]
      Summarise our discussion into action items

AI: # Meeting Summary
    ## Action Items
    - [ ] ...

[✓ Create Note]

→ "Meeting Summary.md" opens with full content as diff
→ Accept saves it, Discard deletes it
```

### Flow 5: Multi-Turn Refinement
```
User: @[[Draft Essay]] What's weak about this?
AI:   The conclusion doesn't tie back to...

User: Rewrite the conclusion only
AI:   Here's a new conclusion:  [Apply to Draft Essay]

User: Make it shorter
AI:   [Apply to Draft Essay]
```

### Flow 6: Append to Note
```
User: /append [[Daily Notes/2026-05-02]]
      Add a summary of today's work

AI generates summary → appended directly to note
Obsidian Notice: "Appended to Daily Notes/2026-05-02"
```

---

## Competitive Context

| Feature | Copilot | Obsidian AI v1 | Obsidian AI v2 |
|---|---|---|---|
| Persistent chat panel | ✅ | ❌ | ✅ |
| Multi-turn conversation | ✅ | ❌ | ✅ |
| @mention vault notes | ✅ | ❌ | ✅ |
| Streaming responses | ✅ | ❌ | ✅ |
| Apply response to note | ❌ (chat only) | inline only | ✅ from chat |
| Create note from chat | ❌ | ❌ | ✅ |
| Inline diff + accept/discard | ❌ | ✅ | ✅ (both) |
| Vault semantic search | ✅ | ❌ | ❌ (deferred) |
| Local model support | ✅ | ✅ | ✅ |

---

## Known Limitations (v2.0 scope)

- No vault-wide semantic search / vector indexing (deferred)
- No PDF / image / YouTube / web page context
- No per-model exact tokenisation (rough estimation only)
- Mobile UI not specifically optimised
