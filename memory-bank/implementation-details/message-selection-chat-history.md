# Message Selection and Chat History Export Design

*Created: 2026-08-14*
*Last Updated: 2026-10-25 11:19:59 IST*
*Task: T20*

## Scope

T20 adds two focused workflows: long-press multi-message selection in the active chat and compact copy/export actions for saved sessions. It does not redesign the overall chat UI.

## Message selection

`useChatUI` owns `selectionMode` and the selected message ID set. A cancellable long-press timer in `MessageBubble` activates selection mode; pointer movement, cancellation, and release before the threshold cancel the timer. Once active, selecting a message toggles its ID and the toolbar exposes the count, Markdown copy, and cancel actions. Selection is cleared when the active session changes.

Selected messages are serialized through the shared `src/utils/exportChat.ts` Markdown serializer. This keeps role, ordering, timestamps, and existing message metadata formatting consistent with session exports.

## Chat History actions

`SessionPickerModal` is titled Chat History. Entries use a compact layout with title, metadata, preview, a searchable history input, and an in-app tag filter. The filter opens a compact list with session counts, selected state, and keyboard selection. Each card shows up to four tag chips plus a +N overflow marker; an accessible tag icon opens the full session-scoped Manage tags modal. One Search or create a tag field filters available labels and creates new labels from unmatched text. Its list opens on focus, supports keyboard selection, and keeps all available tags in a bounded scroll region. Rows reuse the History filter's tag icon, session count, and compact styling. The picker stays in the modal's scrollable content so the footer remains visible. Users can create labels, remove individual labels, or remove all tags. Load, copy, export, rename, and delete remain as compact icon actions on each entry. Copy and export retain Markdown, JSON, and JSONL choices. The actions use Obsidian icons and existing modal/button surfaces; action events remain separate from session selection.

## Chat History redesign follow-up — 2026-10-23

The selected Option C mockup was implemented after user review. The History list has search and tag filtering, a per-session Manage tags modal with a searchable existing-tag dropdown, and inline icon actions for all session operations. The October 25 follow-up replaced expandable tag counts with the first four tag chips, a +N overflow marker, and an accessible icon to open the full manager. The T78 bulk-generation progress modal also previews recent generated tags. The October 25 follow-up passed 22 focused tests and the production build; live Obsidian UI acceptance remains pending.

The manager picker follow-up unifies search and creation in one field, shows the full available list in scrollable History-style rows with session counts, and offers label creation for unmatched text. Formatting, production build, and `git diff --check` pass; automated tests and live Obsidian UI acceptance were not run.

## Verification

The completed implementation was validated with 210 tests, TypeScript, the production build, and `git diff --check`. Commits: `b980d7a`, `e6fa1f7`, `7d02f17`, `eb844b0`, `ffa2e17`, and `a9cad79`.
