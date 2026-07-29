# Past-Session Search and Shared Tabs
*Created: 2026-07-29 13:47:51 IST*
*Last Updated: 2026-07-29 13:47:51 IST*

## Purpose

Let an agent find relevant saved conversations, cite them directly in its reply, and open a matching message in a shared chat panel without creating duplicate Obsidian sidebar leaves.

## Search Index

`src/search/index.ts` builds a lightweight inverted index from JSONL session files in the plugin data directory. It accepts both adapter path forms returned by Obsidian and falls back to legacy `data.json` when no JSONL messages are available. A search result contains the session ID, message ID, timestamp, and a bounded message snippet.

The `search_past_sessions` tool calls this index through `ToolExecutor`. The executor receives the current session ID as a callback and filters it before applying the requested limit. A conversation therefore cannot return itself as a “past session” result.

## Agent Discovery and Result Links

The system prompts explicitly tell agents that `search_past_sessions` searches saved chat history, not vault notes. `useMessageActions` collects tool results and appends a `### Past sessions` section to the assistant reply.

Each result is rendered as a Markdown bullet with:

1. a bold, clickable saved-session title;
2. a readable, whitespace-normalized matching excerpt beneath it; and
3. an `obsidian-ai://open-session` URL containing the target session and message IDs.

Repeated matches for the same message are de-duplicated. `MessageBubble` intercepts the custom URL rather than sending it to the operating system, then dispatches an in-app session-open event.

## Shared Internal Tabs

`ChatApp` owns an ordered list of open session IDs. Opening a result adds the target only once, activates it, and passes the target message ID to `ChatMessages`, which scrolls and briefly highlights that message.

`ChatTabBar` renders the list inside the existing chat view. It deliberately does not create an Obsidian `WorkspaceLeaf`: the action toolbar and message composer are therefore rendered once and shared by every tab. Closing a tab only removes it from the tab strip; it never deletes its saved session. If the active tab closes, the neighboring tab becomes active.

Tabs use a compact fixed-width label, ellipsis, and horizontal overflow. This preserves usable titles while allowing an arbitrary number of open sessions. Further visual polish of tab labels remains deferred by user choice.

## Composer Shortcut

When the setting disables Enter-to-send, Enter inserts a line break. Shift+Enter and Cmd/Ctrl+Enter remain send shortcuts, as stated in the input placeholder and handled by `ChatInput` key processing.

## Files and Verification

| Area | Files |
|---|---|
| Index and exclusion | `src/search/index.ts`, `src/agent/ToolExecutor.ts` |
| Tool discoverability and inline formatting | `src/lib/systemPrompt.ts`, `src/agent/Orchestrator.ts`, `src/hooks/useMessageActions.ts` |
| Internal navigation | `src/components/MessageBubble.tsx`, `src/components/ChatApp.tsx`, `src/components/ChatTabBar.tsx`, `src/main.ts`, `styles.css` |
| Keyboard handling | `src/components/ChatInput.tsx` |

Validated during this session with the focused search-index test suite, TypeScript `--noEmit`, production esbuild, and `git diff --check`.

## Related Work

- T15: Tabbed Chat Interface with Multi-Profile
- T2: Conversation Chain and Memory
- T13: Agentic Tool Calling for Note Editing

## Attribution

All implementation work documented here was performed in the 2026-07-29 session by **GPT 5.6 Terra Low**.
