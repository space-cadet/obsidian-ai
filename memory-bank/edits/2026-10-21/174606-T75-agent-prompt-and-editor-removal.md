---
kind: edit_chunk
id: 20261021-t75-agent-prompt-and-editor-removal
created_at: 2026-10-21 17:46:06 IST
task_ids: [T75, T61, T43, T5]
source_branch: main
source_commit: 223bb52d79035dbd70e7e48611a0b3fc4a3c10ce
---

#### 17:46:06 IST - T75: Add prompt management and remove the legacy editor
- Created `src/defaultAgentPrompt.ts` - Store the shared default prompt with Obsidian-compatible LaTeX delimiters.
- Created `src/modals/AgentPromptModal.ts` - Provide full prompt viewing, editing, cancel, save, and reset controls in the native modal pattern.
- Created `src/modules/EditContextState.ts` - Keep note-edit context for chat-originated changes.
- Created `src/settings-sections/chatCommands.ts` - Keep the built-in chat command reference.
- Modified `src/settings.ts` - Persist `agentPrompt` and remove obsolete editor settings.
- Modified `src/data/PluginDataManager.ts` - Reset the shared prompt when plugin settings are excluded from sync.
- Modified `src/lib/systemPrompt.ts` - Use the editable base prompt in single-agent requests.
- Modified `src/agent/turnLifecycle.ts` - Pass the configured prompt to single-agent request construction.
- Modified `src/agent/Orchestrator.ts` - Use the shared prompt in group-agent requests.
- Modified `src/components/ChatApp.tsx` - Supply the latest prompt to the group-agent orchestrator.
- Modified `src/agent/tools.ts` - Define get, update, and reset prompt tools.
- Modified `src/agent/types.ts` - Add prompt result metadata.
- Modified `src/agent/toolRegistry.ts` - Register prompt tools and Developer mode availability.
- Modified `src/agent/ToolExecutor.ts` - Route prompt tool calls to settings handlers.
- Modified `src/agent/targetLocks.ts` - Lock prompt mutations by setting key.
- Modified `src/agent/tools/handlers/settingsHandlers.ts` - Persist guarded prompt mutations and audit operation and length.
- Modified `src/lib/selfSettingsTools.ts` - Remove obsolete message-history setting validation.
- Modified `src/settings-sections/chatDefaults.ts` - Place the prompt control in Chat Defaults.
- Modified `src/settings-sections/SettingsTab.ts` - Remove old prompt fields and register the Chat Commands section.
- Modified `src/modules/AIExtension.ts` - Add generic AI edit accept and clear effects.
- Modified `src/modules/diffExtension.ts` - Keep shared diff review and remove widget-specific focus handling.
- Modified `src/noteEditing/NoteEditingBridge.ts` - Use generic edit context for chat note changes.
- Modified `src/ui/registration.ts` - Register accept/discard note-edit commands and remove the floating editor extension.
- Modified `src/api.ts` - Remove the blocking selection editor API and prompt-history state.
- Deleted `src/api/history.ts` - Remove the legacy prompt-history type.
- Deleted `src/default_prompts.ts` - Remove selection and cursor prompt defaults.
- Deleted `src/modules/SelectionState.ts` - Remove selection/cursor editor state.
- Deleted `src/modules/WidgetExtension.ts` - Remove the legacy floating tooltip editor.
- Deleted `src/modules/commands/parser.ts` - Remove legacy editor prompt parsing.
- Deleted `src/modules/commands/source.ts` - Remove legacy editor command completion.
- Deleted `src/modules/messageHistory/queue.ts` - Remove selection/cursor prompt history.
- Deleted `src/settings-sections/customCommands.ts` - Remove custom editor prompt settings.
- Modified `src/data/__tests__/PluginDataManager.test.ts` - Replace obsolete settings expectations with `agentPrompt` behavior.
- Modified `src/lib/__tests__/selfSettingsTools.test.ts` - Remove message-history setting fixtures and assertions.
- Modified `styles/_base.css` - Remove legacy tooltip styles.
- Modified `styles/_settings.css` - Style the prompt modal.
- Modified `styles.css` - Regenerate the packaged stylesheet.
- Modified `README.md` - Document chat note review and editable prompt controls; remove old tooltip instructions.
- Modified `CONTRIBUTING.md` - Remove guidance for the legacy editor feature.
- Modified `package.json` - Update the product description.
- Modified `settings-mockup-improved.html` - Show the Agent prompt control under Chat Defaults.
- Deleted `docs/demo.gif` - Remove the unreferenced demo for the removed editor workflow.
- Modified `memory-bank/projectbrief.md` - Align the current product brief with chat-based note editing and prompt management.
- Modified `memory-bank/productContext.md` - Mark the former editor flow as historical and document the current product.
- Modified `memory-bank/systemPatterns.md` - Document the current CodeMirror note-review and prompt flows.
- Modified `memory-bank/implementation-details/settings-provider-design.md` - Update the settings schema and prompt management behavior.
- Modified `memory-bank/implementation-details/model-discovery-design.md` - Update the current note-editing description.
- Modified `memory-bank/implementation-details/note-editing-design.md` - Reconcile note diff review, commands, and create-note discard behavior with current code.
- Modified `memory-bank/implementation-details/chat-panel-design.md` - Mark the old tooltip and selection references as a historical design snapshot.
- Modified `memory-bank/implementation-details/proposed-architecture.md` - Mark the old hybrid editor proposal as historical.
- Modified `memory-bank/implementation-details/context-system-design.md` - Mark the removed tooltip selection bridge as historical.
- Modified `memory-bank/implementation-details/chatapp-settings-decomposition.md` - Clarify the old WidgetExtension size row is a dated snapshot.
- Modified `memory-bank/implementation-details/refactored-architecture.md` - Update current prompt and note-edit architecture references.
- Modified `memory-bank/implementation-details/ai-sdk-migration.md` - Clarify old selection-editor migration references are historical.
- Modified `memory-bank/techContext.md` - Add a current technical snapshot and label the older architecture sections.
- Modified `memory-bank/implementation-details/open-source-branding.md` - Mark the old manifest description as historical and record the current package description.
- Modified `memory-bank/implementation-details/multi-user-chat-design.md` - Document shared prompt management alongside the LaTeX rule.
- Modified `memory-bank/tasks/T43.md` - Record prompt management after the earlier math-prompt status note.
- Modified `memory-bank/tasks/T61.md` - Record prompt-specific agent tools and removal of the old setting.
- Created `memory-bank/tasks/T75.md` - Record scope, acceptance, and verification status.
- Modified `memory-bank/tasks.md` - Register completed task T75 and update task counts.
- Modified `memory-bank/activeContext.md` - Record the current T75 outcome before the earlier session note.
- Modified `memory-bank/session_cache.md` - Record current T75 status and verification limits.
- Created `memory-bank/sessions/2026-10-21-agent-prompt-and-editor-removal.md` - Record the session closeout.
- Created `memory-bank/edits/2026-10-21/174606-T75-agent-prompt-and-editor-removal.md` - Record this canonical edit chunk.
- Modified `memory-bank/edit_history.md` - Add the generated-view entry manually because no Markdown history generator is available.
