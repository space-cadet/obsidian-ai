# Chat View Singleton Lifecycle

*Created: 2026-08-04*

## Purpose

Keep exactly one Obsidian `WorkspaceLeaf` of type `obsidian-ai-chat-view`. Internal conversation tabs belong inside its single `ChatApp` React tree; they must not be represented by stacked Obsidian sidebar leaves.

## Restored Workspace Cleanup

`ObsidianAIPlugin.onload()` registers `removeDuplicateChatLeaves()` with `workspace.onLayoutReady()`. This runs only after Obsidian has restored its saved desktop layout, when every persisted leaf can be observed.

The cleanup retains the active chat leaf where possible, otherwise the first restored chat leaf, and calls `detach()` on all other leaves of that type. This removes stale UI copies without deleting saved conversations, which remain in chat storage.

## Activation Race Guard

`activateChatView()` serializes callers through one in-flight promise. The inner activation cleans up duplicate leaves before lookup, waits one animation frame if restoration is still underway, cleans up again, and creates a right-sidebar leaf only if none exists. The surviving leaf is then revealed.

This covers both old duplicate leaves restored from an earlier plugin version and two commands/ribbon invocations arriving during restoration.

## Verification

`pnpm run build` passed on 2026-08-04, including TypeScript checking and production esbuild. `git diff --check` also passed.
