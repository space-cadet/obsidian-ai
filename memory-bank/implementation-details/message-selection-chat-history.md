# Message Selection and Chat History Export Design

*Created: 2026-08-14*
*Last Updated: 2026-10-23 15:18:41 IST*
*Task: T20*

## Scope

T20 adds two focused workflows: long-press multi-message selection in the active chat and compact copy/export actions for saved sessions. It does not redesign the overall chat UI.

## Message selection

`useChatUI` owns `selectionMode` and the selected message ID set. A cancellable long-press timer in `MessageBubble` activates selection mode; pointer movement, cancellation, and release before the threshold cancel the timer. Once active, selecting a message toggles its ID and the toolbar exposes the count, Markdown copy, and cancel actions. Selection is cleared when the active session changes.

Selected messages are serialized through the shared `src/utils/exportChat.ts` Markdown serializer. This keeps role, ordering, timestamps, and existing message metadata formatting consistent with session exports.

## Chat History actions

`SessionPickerModal` is titled Chat History. Entries use a compact layout with title, metadata, preview, a searchable history input, and the existing tag filter. Tag counts expand to show the labels; Manage tags opens a session-scoped modal with a searchable dropdown of available labels, create-new support, removal, and Remove all tags. Load, copy, export, rename, and delete remain as compact icon actions on each entry. Copy and export retain Markdown, JSON, and JSONL choices. The actions use Obsidian icons and existing modal/button surfaces; action events remain separate from session selection.

## Chat History redesign follow-up — 2026-10-23

The selected Option C mockup was implemented after user review. The History list now has search and tag filtering, tag counts that expand inline, a per-session Manage tags modal with a searchable existing-tag dropdown, and inline icon actions for all session operations. Production build and diff checks passed. Automated tests and live Obsidian UI acceptance remain pending.

## Verification

The completed implementation was validated with 210 tests, TypeScript, the production build, and `git diff --check`. Commits: `b980d7a`, `e6fa1f7`, `7d02f17`, `eb844b0`, `ffa2e17`, and `a9cad79`.
