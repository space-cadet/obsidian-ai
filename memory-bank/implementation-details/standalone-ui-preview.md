# Implementation Detail: Standalone UI Preview and Obsidian Host Boundary
*Created: 2026-08-12 11:11:56 IST*
*Last Updated: 2026-08-12 11:11:56 IST*
*Related Task: T44*

## Purpose

Provide a browser-based workshop for the React chat UI without requiring a
running Obsidian process. The preview is for presentational development and
state coverage. Obsidian remains the authority for host integration, vault
behavior, Markdown rendering, workspace navigation, and mobile WebView
acceptance.

## Existing Foundation

- Vitest runs in jsdom and aliases `obsidian` to `__mocks__/obsidian.ts`.
- React Testing Library already renders and interacts with isolated components.
- T21 provides a Node-side mock application for AI and attachment workflows.
- T22 already owns the ChatApp decomposition and has extracted most action
  domains into hooks.

These layers should remain distinct:

| Layer | Purpose | Host required |
|---|---|---|
| Vitest/jsdom | Fast component and hook behavior tests | No |
| Storybook | Persistent visual/component workshop | No |
| Browser Mode or Playwright | Real-browser interaction and viewport checks | No |
| Obsidian | ItemView, vault, editor, renderer, and mobile acceptance | Yes |
| T21 CLI harness | AI, attachment, and tool execution checks | No |

## Target Architecture

```text
src/host/
  ChatHost.ts              # neutral interfaces used by UI-facing code
  ObsidianChatHost.ts      # production adapter over Obsidian APIs

src/components/
  ChatApp.tsx              # controller/composition layer
  ChatLayout.tsx           # visual shell
  ChatToolbar.tsx          # action bar and participant controls
  ChatMainArea.tsx         # transcript, tools, and composer
  ChatOverlays.tsx         # modal and overlay composition

stories/
  ChatLayout.stories.tsx
  ChatToolbar.stories.tsx
  ChatMainArea.stories.tsx
  fixtures/chatStates.ts
```

The exact directory names can change during implementation, but the dependency
direction must remain:

```text
ObsidianAIChatView -> ObsidianChatHost -> ChatApp -> presentational UI
Storybook fixture  -> FixtureChatHost  -> ChatLayout/presentational UI
```

The standalone entry point must not import `obsidian`, `ItemView`, or the
production view module merely to render a UI story.

## Host Boundary

The first extraction should move `ChatPluginLike` out of
`src/views/ObsidianAIChatView.ts`. The neutral interface should expose only
capabilities required by the component or hook using it, rather than passing
the entire Obsidian plugin object everywhere.

Candidate capabilities:

- `notify(message)` for user-visible notices
- `renderMarkdown(markdown, target, sourcePath)` for message rendering
- `getMentionCandidates(query)` for composer autocomplete
- `readVaultFile(path)` for context and attachment fixtures
- `openNote(path)` and `applyNoteChange(...)` for note actions
- settings/profile data needed by the toolbar

The production adapter may implement these through Obsidian. The fixture
adapter should use deterministic data and simple browser-safe implementations.

## Fixture States

The initial stories should cover:

1. Empty chat with setup warning
2. Normal user and assistant exchange
3. Active streaming response with token count
4. Pending tool approval and tool result
5. Error and interrupted response
6. One selected model and multi-agent selection
7. Relay-only human chat with remote attribution
8. Context and attachment chips
9. Editing/retry state
10. Desktop and narrow mobile-sized viewports

Fixtures should use fake messages, profiles, context items, and callbacks. No
provider keys, vault content, relay connections, or real network calls belong
in stories.

## Tool Choice

Storybook is the primary preview surface because it provides a persistent
browser workshop and makes hard-to-reach UI states addressable. The current
Vitest/jsdom suite remains the primary fast regression layer.

Add a real-browser layer only for behavior that jsdom cannot establish
reliably:

- transcript scrolling and scroll restoration
- touch-sized composer layout
- browser DOM/event behavior around streaming updates
- optional visual snapshots after the layout stabilizes

Vitest Browser Mode is the lower-friction option because the project already
uses Vitest. Playwright is appropriate if broader end-to-end workflow coverage,
trace inspection, or screenshot baselines become important. The first
implementation should choose one rather than adding both immediately.

## Verification Boundaries

| Evidence | What it proves | What it does not prove |
|---|---|---|
| Storybook story renders | UI state is viewable in isolation | Obsidian integration works |
| Vitest component test passes | DOM behavior and callbacks work | Real Obsidian APIs work |
| Browser viewport check passes | Browser layout/scroll behavior works | Mobile Obsidian chrome is correct |
| `pnpm run build` passes | Plugin bundle/type integration is valid | User-visible Obsidian behavior |
| Manual Obsidian check passes | Host and mobile integration works | All isolated states are covered |

## Non-Goals

- Replacing Obsidian's Markdown renderer in production
- Building a fake complete Obsidian workspace
- Making Storybook or browser fixtures part of the plugin bundle
- Moving AI/provider integration into the browser preview
- Treating preview screenshots as a substitute for Obsidian acceptance
