---
kind: edit_chunk
id: 015330-T15-settings-draft-tabs
created_at: 2026-08-05 01:53:30 IST
task_ids: [T15]
source_branch: main
source_commit: ae12460a35243ca04a3af7140e1f18272a0049ec
---

#### 01:53:30 IST - T15: Settings navigation and draft tab lifecycle
- Modified `src/settings-sections/SettingsTab.ts` - Repaired in-panel navigation and the AI Intelligence Layer shortcut target
- Modified `src/settings-sections/chatDefaults.ts` - Documented the allowed tab-title width range
- Modified `src/settings-sections/diagnostics.ts` - Replaced the unstructured usage line with a model table
- Modified `src/settings.ts` - Persisted and normalized the tab-title width setting
- Modified `src/components/ChatApp.tsx` - Passed only saved sessions to history and export views
- Modified `src/components/ChatTabBar.tsx` - Applied the configured tab-title width
- Modified `src/components/SessionPickerModal.tsx` - Filtered zero-message drafts from history
- Modified `src/hooks/useChatSession.ts` - Separated drafts from persisted sessions and cleaned legacy empty sessions
- Modified `src/hooks/useSessionActions.ts` - Opened each new draft tab and discarded unsent tabs on close
- Created `src/hooks/__tests__/useSessionActions.test.ts` - Covered repeated draft-tab creation
- Created `src/components/__tests__/SessionPickerModal.test.tsx` - Covered history filtering
- Modified `styles.css` - Added compact diagnostics and Settings navigation styles
- Modified `memory-bank/implementation-details/past-session-search-and-tabs.md` - Documented the tab contract and diagrams
