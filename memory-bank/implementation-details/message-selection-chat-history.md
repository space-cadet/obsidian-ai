# Message Selection and Chat History Export Design

*Created: 2026-08-14*
*Last Updated: 2026-10-23 16:23:43 IST*
*Task: T20*

## Scope

T20 adds two focused workflows: long-press multi-message selection in the active chat and compact copy/export actions for saved sessions. It does not redesign the overall chat UI.

## Message selection

`useChatUI` owns `selectionMode` and the selected message ID set. A cancellable long-press timer in `MessageBubble` activates selection mode; pointer movement, cancellation, and release before the threshold cancel the timer. Once active, selecting a message toggles its ID and the toolbar exposes the count, Markdown copy, and cancel actions. Selection is cleared when the active session changes.

Selected messages are serialized through the shared `src/utils/exportChat.ts` Markdown serializer. This keeps role, ordering, timestamps, and existing message metadata formatting consistent with session exports.

## Chat History actions

`SessionPickerModal` is titled Chat History. Entries use a compact layout with title, metadata, preview, a searchable history input, and an in-app tag filter. The filter opens a compact list with session counts, selected state, and keyboard selection. Tag counts expand to show the labels; Manage tags opens a session-scoped modal with separate fields to enter a new label and search available labels. The picker opens while either field is focused, supports keyboard selection, and keeps the full available-tag list in a bounded scroll region. Rows reuse the History filter's tag icon, session count, and compact styling. The picker stays in the modal's scrollable content so the footer remains visible. Users can create labels, remove individual labels, or remove all tags. Load, copy, export, rename, and delete remain as compact icon actions on each entry. Copy and export retain Markdown, JSON, and JSONL choices. The actions use Obsidian icons and existing modal/button surfaces; action events remain separate from session selection.

## Chat History redesign follow-up — 2026-10-23

The selected Option C mockup was implemented after user review. The History list now has search and tag filtering, tag counts that expand inline, a per-session Manage tags modal with a searchable existing-tag dropdown, and inline icon actions for all session operations. Production build and diff checks passed. Automated tests and live Obsidian UI acceptance remain pending.

The manager picker follow-up adds an internal search field for existing labels, removes the item cap, and uses scrollable History-style rows with session counts. The outer Add tag field now clearly creates a label. Formatting, production build, and `git diff --check` pass; automated tests and live Obsidian UI acceptance were not run.

## Verification

The completed implementation was validated with 210 tests, TypeScript, the production build, and `git diff --check`. Commits: `b980d7a`, `e6fa1f7`, `7d02f17`, `eb844b0`, `ffa2e17`, and `a9cad79`.
