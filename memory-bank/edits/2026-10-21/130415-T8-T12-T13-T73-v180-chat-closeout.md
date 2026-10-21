---
kind: edit_chunk
id: T8-T12-T13-T73-v180-chat-closeout
created_at: 2026-10-21 13:04:15 IST
task_ids: [T8, T12, T13, T73]
source_branch: main
source_commit: a3e3fbff3074f587eb505af286ae279080edb79a
---

#### 13:04:15 IST - T8/T12/T13/T73: Record v1.8.0 chat changes and Memory Bank closeout
- Modified `CHANGELOG.md` - Added v1.8.0 release notes for current chat improvements.
- Modified `manifest.json` - Set plugin version to 1.8.0.
- Modified `package.json` - Set package version and include the splash asset in the release package.
- Modified `versions.json` - Record the v1.8.0 compatibility mapping.
- Created `assets/chat-lab-splash-v1.8.0.png` - Add the selected assembly-line splash artwork.
- Modified `src/agent/AgentLoop.ts` - Format bounded note-read results with continuation metadata.
- Modified `src/agent/Orchestrator.ts` - Continue large-file reads across agent steps.
- Modified `src/agent/ToolExecutor.ts` - Execute bounded line and character reads.
- Modified `src/agent/tools.ts` - Define read ranges and past-session search scope.
- Modified `src/agent/tools/handlers/noteHandlers.ts` - Read bounded line or character ranges from notes.
- Modified `src/agent/tools/handlers/sessionHandlers.ts` - Search saved session titles and message content with scope and title-first ordering.
- Modified `src/agent/turnLifecycle.ts` - Handle title-only session search results without a message target.
- Modified `src/agent/types.ts` - Add range and session-search result types.
- Modified `src/components/ChatApp.tsx` - Show the one-time splash in the fresh-install empty chat.
- Modified `src/components/ChatMainArea.tsx` - Connect the assistant transcript to the available chat width.
- Modified `src/components/ChatMessages.tsx` - Render the empty-chat splash state.
- Modified `src/components/ChatToolbar.tsx` - Expose the updater action in toolbar overflow.
- Modified `src/components/MessageBubble.tsx` - Allow title-only session results to open chats.
- Modified `src/components/presentational/ActionBar.tsx` - Add Check for Updates to the overflow menu.
- Modified `src/hooks/useSessionActions.ts` - Navigate to sessions returned without a message ID.
- Modified `src/lib/systemPrompt.ts` - Guide title-scoped search and complete bounded file inspection.
- Modified `src/main.ts` - Persist and initialize the first-run splash-seen state.
- Modified `src/search/index.ts` - Improve saved-session title and content matching.
- Modified `src/settings.ts` - Add the persisted splash-seen setting.
- Modified `src/views/ObsidianAIChatView.ts` - Resolve the splash image from the installed plugin directory.
- Modified `styles.css` - Regenerate the packaged stylesheet.
- Modified `styles/_chat.css` - Style the splash and full-width assistant messages.
- Modified `memory-bank/activeContext.md` - Record tool, search, toolbar, layout, and splash status.
- Modified `memory-bank/implementation-details/agentic-tool-calling.md` - Document character-range arguments and continuation behavior.
- Modified `memory-bank/implementation-details/chat-component-capability-map.md` - Add the first-run empty-chat behavior.
- Modified `memory-bank/implementation-details/chat-onboarding-design.md` - Document the first-run splash lifetime and no-dismiss behavior.
- Modified `memory-bank/implementation-details/chat-ui-features.md` - Record toolbar and message-width behavior.
- Modified `memory-bank/session_cache.md` - Refresh the session handoff and timestamp.
- Modified `memory-bank/tasks.md` - Register paused task T12 and refresh the index timestamp.
- Modified `memory-bank/tasks/T8.md` - Record v1.8.0 package and install verification with release gates pending.
- Modified `memory-bank/tasks/T12.md` - Record the splash behavior while keeping remaining onboarding work paused.
- Modified `memory-bank/tasks/T13.md` - Record bounded reads and past-session search improvements.
- Modified `memory-bank/tasks/T24a.md` - Preserve the unconfirmed toolbar-search follow-up.
- Modified `memory-bank/tasks/T73.md` - Record toolbar, message-width, and capability-map updates.
- Created `memory-bank/sessions/2026-10-20-v1.8.0-version-bump.md` - Record the version-bump preparation and pending release steps.
- Created `memory-bank/sessions/2026-10-21-toolbar-and-chat-tool-fixes.md` - Record source changes, verification, and live-acceptance follow-ups.
- Created `memory-bank/edits/2026-10-21/130415-T8-T12-T13-T73-v180-chat-closeout.md` - Add the canonical edit chunk.
- Modified `memory-bank/edit_history.md` - Add the generated-view entry for this edit chunk.
