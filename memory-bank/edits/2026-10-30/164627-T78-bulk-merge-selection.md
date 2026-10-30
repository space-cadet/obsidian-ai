---
kind: edit_chunk
id: 2026-10-30-164627-T78-bulk-merge-selection
created_at: 2026-10-30 16:46:27 IST
task_ids: [T78]
source_branch: feat/session-tags
source_commit: 7892c7ac6bb5df635fe2ea22ab6b69cf50c1eebd
---

#### 16:46:27 IST - T78: Add bulk proposal selection
- Modified `src/modals/NormalizeSessionTagsModal.ts` - Add persistent bulk-selection controls and preserve row edits.
- Modified `src/modals/__tests__/NormalizeSessionTagsModal.test.ts` - Verify bulk selection, exceptions and clearing hidden selections.
- Modified `styles/_settings.css` - Style compact bulk actions beside the summary.
- Modified `styles.css` - Regenerate the app stylesheet.
- Modified `memory-bank/tasks/T78.md` - Record the bulk-selection workflow.
- Modified `memory-bank/session_cache.md` - Record the verification milestone.
- Modified `memory-bank/sessions/2026-10-30-t78-global-tag-normalization.md` - Record the 60-proposal fixture check.
- Modified `memory-bank/implementation-details/session-tags.md` - Document selection scope and preserved edits.
- Modified `memory-bank/changelog.md` - Record the bulk-selection controls.
