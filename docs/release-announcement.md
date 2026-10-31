# Chat Lab AI 1.10.1

Chat Lab AI 1.10.1 includes the session-tag features from 1.10.0 and updates
production dependencies to patched versions.

## Compatibility

- Requires Obsidian 1.11.4 or newer.
- Supports desktop and mobile.

## Session tags

- Add and remove tags on saved sessions, filter History by tag, and preview
  tags with session counts.
- Generate suggestions manually or in bulk, or opt in to automatic suggestions
  for new sessions using a configured provider and model. Requests use a bounded
  excerpt of up to eight messages, capped at 600 characters per message.
- Add agent tools for managing saved-session tags and a review-first flow for
  merging equivalent labels across sessions.
- Preserve tags through legacy-session migration, Markdown/JSON/JSONL exports,
  saved-chat JSON/JSONL imports, and existing remote sync.

Session tags are chat metadata; they do not change Obsidian note tags or
frontmatter. Automatic suggestions are off by default.

## Security

- Update Zod to 4.6.7 and resolve Ajv's `fast-uri` dependency to 3.1.9.
