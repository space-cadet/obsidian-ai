# Chat Lab AI 1.10.0

Chat Lab AI 1.10.0 adds tags for saved chat sessions and tools to organize,
search, and normalize the tag vocabulary.

## Compatibility

- Requires Obsidian 1.11.4 or newer.
- Supports desktop and mobile.

## Added

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
