# Chat Lab AI 1.9.0

Chat Lab AI 1.9.0 adds agent prompt controls, saved-session tools, and support
for replies continuing independently across chat tabs. It also improves PDF
attachments, equation display, and session recovery.

## Compatibility

- Requires Obsidian 1.11.4 or newer.
- Supports desktop and mobile.

## What's new

- Edit, reset, and inspect the shared agent prompt in Settings. The latest
  effective system prompt can be viewed and copied, and agent tools can read
  or update the prompt.
- Agents can list, read, search, open, rename, and delete saved chat sessions.
  Session deletion asks for approval.
- Chat replies can continue in other tabs while you work. Configure the maximum
  number of simultaneous session replies in Settings; the default is five.
- Chat tabs show which session is generating. PDF attachments display more
  compactly, and long equations scroll within their own area.

## Fixes

- Improved approval cancellation, retries, draft restoration, and tab cleanup.
- Protected sessions that are active in another pane and kept delayed sync from
  replacing newer local edits or deletions.
- Removed the legacy selection and cursor prompt editor. Chat Lab's
  Apply-to-Note review flow remains available.
