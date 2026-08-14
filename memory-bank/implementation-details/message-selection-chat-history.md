# Message Selection and Chat History Export Design

*Created: 2026-08-14*
*Last Updated: 2026-08-14 16:42:00 IST*
*Task: T20*

## Scope

T20 adds two focused workflows: long-press multi-message selection in the active chat and compact copy/export actions for saved sessions. It does not redesign the overall chat UI.

## Message selection

`useChatUI` owns `selectionMode` and the selected message ID set. A cancellable long-press timer in `MessageBubble` activates selection mode; pointer movement, cancellation, and release before the threshold cancel the timer. Once active, selecting a message toggles its ID and the toolbar exposes the count, Markdown copy, and cancel actions. Selection is cleared when the active session changes.

Selected messages are serialized through the shared `src/utils/exportChat.ts` Markdown serializer. This keeps role, ordering, timestamps, and existing message metadata formatting consistent with session exports.

## Chat History actions

`SessionPickerModal` is titled `Chat History`. Each session card retains independent icon actions for loading, copying, renaming, and deleting. Copy Markdown, Copy JSON, and Copy JSONL are grouped under the Copy dropdown. Export Markdown, Export JSON, and Export JSONL are grouped under the Export dropdown. Row action events are isolated from the card load handler.

The existing export serializers and vault filename collision behavior are reused rather than duplicated. CSS keeps the card metadata and actions in separate responsive regions so narrow windows wrap without garbling labels.

## Verification

The completed implementation was validated with 210 tests, TypeScript, the production build, and `git diff --check`. Commits: `b980d7a`, `e6fa1f7`, `7d02f17`, `eb844b0`, `ffa2e17`, and `a9cad79`.
