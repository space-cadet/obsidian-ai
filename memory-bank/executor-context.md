# Executor Context — obsidian-ai Plugin

**Purpose:** Distilled cheat sheet for automated executor runs. Keep under 1,000 tokens.

## Tech Stack
- **Language:** TypeScript
- **Framework:** Obsidian Plugin API (no React — DOM manipulation + CSS)
- **Build:** `npm run build` (esbuild, produces `main.js` + `styles.css`)
- **Test:** `npm test` (if available)

## Directory Structure
```
src/
  main.ts              — Plugin entry, lifecycle, command registration
  settings.ts          — Settings tab, config schema, persistence
  tokenEstimator.ts  — Token counting for messages + attachments
  types.ts             — Shared interfaces (ChatMessage, Attachment, etc.)
  storage/             — Chat persistence layer
    session-storage.ts   — Core: JSONL read/write (loadSession, appendMessage, createSession)
    ChatStorage.ts       — Async wrapper: save/load/list/delete sessions
    Migration.ts         — Old format → JSONL migration logic
  modals/
    MigrationPromptModal.ts — UI prompt for migration
  components/
    ChatPanel.tsx      — Main chat UI (sidebar panel)
    MessageList.tsx    — Message rendering thread
    InputArea.tsx      — User input + send button
    SettingsPanel.tsx  — In-app settings UI
  providers/
    openai.ts          — OpenAI API client
    anthropic.ts      — Anthropic API client
    google.ts          — Google Gemini API client
```

## Key Conventions
- **Naming:** PascalCase for components, camelCase for functions/variables, `PascalCase.ts` for files
- **Types:** Defined in `types.ts`, imported everywhere. Add new types there first.
- **State:** Obsidian `Plugin` class holds global state. Component-level state is minimal.
- **Async:** Most API calls are async. Use `await` consistently. Token estimation is now sync (after `workspace-21x` fix).
- **CSS:** `styles.css` at project root. Use Obsidian CSS variables for theming (`--background-primary`, etc.).
- **Storage:** JSONL format at `.obsidian/plugins/obsidian-ai/sessions/{uuid}.jsonl` — human-readable, append-only, git-friendly

## Build & Verify
```bash
npm run build    # Must pass before closing any task
npm test         # Run if available
```

## Common Patterns
- Adding a setting → `settings.ts` (schema + UI) + `main.ts` (usage)
- Adding token counting → `tokenEstimator.ts` only
- Adding UI component → `src/components/` + `styles.css`
- Adding API provider → `src/providers/` + `types.ts` (new provider interface)
- Adding storage → `src/storage/` + update `main.ts` to initialize in `onload()`

## Current Focus (2026-06-14)
- SessionStorage shipped: JSONL persistence, ChatStorage wrapper, migration, plugin integration
- ChatApp now uses ChatStorage for session save/load
- Next: Search UI for past chats, T22 Phase 4+5 (component decomposition)

---
*Created: 2026-06-14 23:17 IST*
*Updated: 2026-06-15 00:17 IST*
*For executor use only — update when architecture changes*
