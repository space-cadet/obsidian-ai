# Chat Lab AI 1.6.0 Release Announcement

Chat Lab AI 1.6.0 improves chat responsiveness, conversation context, remote
sync safety, and sync visibility. It also adds Git write tools through the
Integration Provider API.

## What's new in 1.6.0

### Faster chat and clearer history

- Chat Lab loads the session index at startup and hydrates full transcripts
  when they are opened.
- Large conversations render and scroll more smoothly, and streaming replies
  continue following the newest message until you scroll away.
- History shows indexed message counts for sessions that have not been opened.

### More reliable conversation context

- Tool results are bounded when replayed to a model, while the complete
  transcript remains available in chat history and exports.
- Earlier tool results can be retrieved by stable reference when needed.
- Compaction preserves recovery details and its in-chat notice across reloads.
- Debug history follows the same context projection used for model requests.

### Safer, more visible remote sync

- Review the planned transfers before starting a sync.
- See session titles, upload and download counts, byte totals, progress, and
  local persistence stages.
- View recent sync activity and errors in the sync panel and in-app log.
- Downloads are persisted as a batch, and incomplete data cannot silently
  replace intact conversation history.
- Automatic sync is temporarily disabled until verified. Use **Sync Now** to
  sync manually.

### Git tools and settings

- When the obsidian-git Integration Provider is available, agent tools can
  stage selected paths, commit, pull, and push.
- Settings search, advanced sections, chat export, and local request
  diagnostics have been improved.

## Known limitation

Global search currently searches loaded conversation messages. A session that
has not been opened since startup may not contribute its messages to search
results.

## Compatibility

- Requires Obsidian 1.4.5 or newer.
- Supports desktop and mobile.
- Automatic remote sync is disabled in this release; manual sync remains
  available when remote storage is configured.
- Official Ollama integration remains deferred. Custom OpenAI-compatible local
  model endpoints are supported.

## Installation

### Via BRAT

1. Install **BRAT** from Community Plugins.
2. Add `https://github.com/space-cadet/obsidian-ai` as a beta plugin.

### Manual

Download `main.js`, `manifest.json`, and `styles.css` from [GitHub Releases](https://github.com/space-cadet/obsidian-ai/releases) and copy them to `.obsidian/plugins/chat-lab/`.

## Existing features

Chat Lab AI continues to provide multi-provider streaming chat, agent tools for
vault notes, group chat, relay-based chat, searchable context mentions, web
search, persistent history, and Markdown/JSON/JSONL exports.
