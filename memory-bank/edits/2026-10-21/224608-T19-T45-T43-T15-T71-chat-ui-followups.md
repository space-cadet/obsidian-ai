---
kind: edit_chunk
id: 20261021-t19-t45-t43-t15-t71-chat-ui-followups
created_at: 2026-10-21 22:46:08 IST
task_ids: [T19, T45, T43, T15, T71]
source_branch: codex/t75-agent-prompt-editor
source_commit: 320638e1ebf9931cf8e04f326fe9d4e534640053
---

#### 22:46:08 IST - T19/T45/T43/T15/T71: Record the session's chat fixes
- Modified `src/lib/modelContent.ts` - Normalize AI SDK file parts and convert legacy attachment MIME fields for replay.
- Modified `src/context/AttachmentEngine.ts` - Use the required `mediaType` field for resolved attachment file parts.
- Modified `src/lib/historyBuilder.ts` - Normalize saved file parts in single-agent history.
- Modified `src/agent/Orchestrator.ts` - Normalize saved file parts in group-agent history.
- Modified `src/agent/turnLifecycle.ts` - Pass schema-compatible attachment parts into the model request.
- Modified `src/context/tokenEstimator.ts` - Estimate tokens from either current or legacy attachment MIME fields.
- Modified `src/api.ts` - Align API message content with the corrected file-part shape.
- Modified `src/types.ts` - Align model-facing attachment part types.
- Modified `src/components/MessageBubble.tsx` - Remove oversized PDF Save/Open actions and keep the filename card.
- Modified `src/components/ChatMessages.tsx` - Follow late transcript layout changes while preserving manual scroll-away and hydration restoration.
- Modified `src/components/ChatTabBar.tsx` - Show an accessible generation spinner in every active session tab.
- Modified `src/components/presentational/ActionBar.tsx` - Replace More-menu section headings with separators and conditionally show the collaboration separator.
- Modified `styles/_chat.css` - Constrain horizontal scrolling to MathJax expressions and hide vertical overflow.
- Modified `styles/_chat-extensions.css` - Add per-tab generation indicator styling, including reduced-motion handling.
- Modified `styles.css` - Regenerate packaged styles for equation scrolling and tab indicators.
- Modified `src/agent/__tests__/AgentLoop.test.ts` - Align Codex request version expectations with the package version.
- Modified `src/agent/__tests__/toolRegistry.test.ts` - Cover prompt tools in the registry expectations.
- Modified `src/agent/__tests__/tools.test.ts` - Cover current bounded note-read defaults and prompt tool contracts.
- Modified `src/api/__tests__/CodexProvider.test.ts` - Derive request-version expectations from `PLUGIN_VERSION`.
- Modified `src/context/__tests__/contextBudget.test.ts` - Set budget fixtures to exercise intended limits.
- Modified `src/hooks/__tests__/useMessageActions.test.ts` - Cover the prompt reader in approval handling.
- Modified `src/settings-sections/__tests__/dataHealth.test.ts` - Mock the repair modal and verify the review action opens it.
- Modified `memory-bank/tasks/T19.md` - Record file-part schema compatibility and replay normalization.
- Modified `memory-bank/tasks/T45.md` - Correct the PDF card behavior and remove outdated Save/Open documentation.
- Modified `memory-bank/tasks/T43.md` - Record equation-only horizontal scrolling and hidden vertical overflow.
- Modified `memory-bank/tasks/T15.md` - Record per-tab generation status and overflow-menu separators.
- Modified `memory-bank/tasks/T71.md` - Record late-layout follow behavior and manual scroll preservation.
- Modified `memory-bank/implementation-details/pdf-text-extraction.md` - Document filename-only PDF cards.
- Modified `memory-bank/implementation-details/chat-component-capability-map.md` - Document current equation, tab, attachment, and follow-scroll behavior.
- Modified `memory-bank/implementation-details/chat-ui-features.md` - Record the session's user-facing UI follow-ups.
- Modified `memory-bank/activeContext.md` - Record current outcomes and verification limits.
- Modified `memory-bank/session_cache.md` - Record source commits, verification, and open live acceptance.
- Modified `memory-bank/changelog.md` - Add unreleased notes for the session fixes and test alignment.
- Created `memory-bank/sessions/2026-10-21-chat-attachments-equations-tabs-scroll.md` - Record full session scope and verification.
- Created `memory-bank/edits/2026-10-21/224608-T19-T45-T43-T15-T71-chat-ui-followups.md` - Record this canonical edit chunk.
- Modified `memory-bank/edit_history.md` - Refresh the text-primary history view manually because no safe Markdown history generator is available.
