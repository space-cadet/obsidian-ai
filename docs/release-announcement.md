# Chat Lab AI v1.3.4 Release Announcement

Obsidian AI is an AI-powered assistant for Obsidian that combines fast inline editing with a persistent sidebar chat panel — now with multi-device sync and group chat.

## What's New in v1.3.4

- Community Directory compatibility and security remediation follow-up.
- Reproducible, attested release assets built from the exact tag.
- Official Ollama integration remains deferred; custom OpenAI-compatible endpoints remain supported.

### Multi-Device Sync (WebSocket Relay)

- **Real-time chat sync** across laptop, tablet, and phone via self-hosted WebSocket relay
- **Zero persistence** — relay is stateless, no messages stored on server
- **LAN auto-discovery** — detect your local IP for easy same-network setup
- Start relay with `pnpm run relay` or `node relay/relay-server.js`

### Build Info in Settings

- Version badge, git commit hash, and branch name now visible in Settings hero
- Know exactly which build you're running at a glance

### Improved Relay Logging

- Detailed client join/leave tracking with connection duration
- Ping/pong heartbeat for dead connection detection
- Graceful cleanup on abrupt disconnects

## Installation

### Via BRAT (Recommended)

1. Install **BRAT** from Community Plugins
2. Add Beta plugin: `https://github.com/space-cadet/obsidian-ai`
3. Auto-updates enabled

### Manual

Download `main.js`, `manifest.json`, and `styles.css` from [GitHub Releases](https://github.com/space-cadet/obsidian-ai/releases) and copy to `.obsidian/plugins/chat-lab/`.

## Full Feature Set

- **Inline AI Editing** — Highlight text, press `Ctrl/Cmd + K`, diff preview, accept/discard
- **13 Agentic Tools** — Read, edit, create, move, search, delete notes from chat
- **Group Chat** — Multiple AI agents in one conversation with debate mode
- **Multi-Device Sync** — WebSocket relay for real-time cross-device chat
- **Vault-Aware Context** — @mention notes, folders, tags; active note context
- **Web Search** — DuckDuckGo, Brave, Tavily, Exa, SearXNG
- **Provider paths** — OpenAI, Anthropic, Google, DeepSeek, OpenRouter, Azure, Agent, and Custom/OpenAI-compatible endpoints. Official Ollama integration is deferred pending a maintained dependency.
- **Directory name** — The valid Community Plugins name is `Chat Lab AI`; “Obsidian AI” remains the product subtitle and UI branding because directory names may not contain “Obsidian”.
- **Streaming** — Real-time response streaming with token usage indicator
- **Session History** — Persistent conversations across restarts

## Acknowledgments

Originally forked from [FBarrca/obsidian-inlineAI](https://github.com/FBarrca/obsidian-inlineAI). UI patterns inspired by [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot).
