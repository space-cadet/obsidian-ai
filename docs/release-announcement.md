# Chat Lab AI v1.5.0 Release Announcement

Chat Lab AI 1.5.0 improves collaborative agent chat, memory management, context reliability, settings, and lifecycle organization while preserving the existing multi-provider and multi-device workflows.

## What's New in v1.5.0

### Collaborative Agent Chat

- Sequential multi-agent conversations now pass each completed response to the next agent.
- Agent output is sanitized so attribution echoes and generated responses for other agents do not appear in the conversation.
- Tool execution is available through the multi-agent orchestrator, with improved approval and continuation behavior.

### Three-Tier Memory

- Added core, staged, and archive memory tiers.
- Core memory is included in the model context within the configured budget.
- Added memory curation tools, ranked archive search, migration metadata, and bounded backup cleanup.

### Context and Reliability

- Agent turns preserve tool-call and tool-result history automatically.
- Improved context budgeting, pairing validation, and compaction handling.
- Added focused coverage for orchestration, memory, persistence, plugin-data sync, and safety behavior.

### Settings and Maintenance

- Improved settings search, navigation, controls, collapsible sections, and layout.
- Split the stylesheet into maintainable source partials with deterministic build-time concatenation.
- Split storage persistence, synchronization, plugin-data sync, and turn actions into focused lifecycle modules.

## Compatibility

- Requires Obsidian 1.4.5 or newer.
- Supports desktop and mobile.
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
