<h1 align="center">Chat Lab AI</h1>

<p align="center">
  <a href="https://github.com/space-cadet/obsidian-ai">GitHub</a>
  ·
  <a href="https://github.com/space-cadet/obsidian-ai/issues">Report Bug</a>
  ·
  <a href="https://github.com/space-cadet/obsidian-ai/discussions">Discussions</a>
</p>

---

> **🤖 Multi-Agent AI Chat for Obsidian**
>
> A persistent chat panel where you can work with one or several AI profiles in a shared conversation. Agents can use selected vault context and tools; connect providers with API keys or supported account sign-in.

## ✨ Feature Highlights

### Core features

| Feature | What It Does |
| --- | --- |
| **Multi-Agent Chat** | Select multiple AI profiles to participate in one conversation |
| **Agentic Vault Tools** | Ask agents to read, search, create, and edit vault notes |
| **Vault-Aware Context** | Include notes, folders, tags, the active note, and expanded embeds |
| **Dataview Queries** | Run optional, read-only DQL queries when Dataview is available |
| **Model Providers** | OpenAI, Codex, Anthropic, Google, DeepSeek, Kimi, Ollama, OpenRouter, Azure, and custom endpoints |
| **Web Search** | DuckDuckGo, Brave, Tavily, Exa, and SearXNG |
| **Session History & Search** | Save and restore conversations; agents can search past sessions by topic, keyword, or content |
| **Remote Sync** | Sync chat sessions across devices through WebDAV storage |
| **Agent Introspection** | Let agents report the plugin version and currently available capabilities |
| **Token Usage & Statistics** | Track context usage and review token totals, model usage, and response statistics |

### Additional features

| Feature | What It Does |
| --- | --- |
| **Inline AI Editing** | Review context-aware note edits in a visual diff before applying them |
| **Mobile Layout** | Responsive chat controls for phone and tablet screens |
| **Auto-Updater** | Check and install stable or development releases |

## ✨ What It Does

Chat Lab AI adds a persistent chat panel to Obsidian with multi-agent conversations, vault-aware context, and structured tools for working with notes.

## 🚀 Core Features

### Multi-Agent Chat

Select one or several AI profiles to participate in a chat. Each selected agent receives the shared conversation and can respond. Use `@AgentName` to route a request to a specific agent.

### Agentic Vault Tools

Agents can use structured tools to read, search, create, and update vault content. A few representative tools:

| Tool | What It Does |
| --- | --- |
| `read_note` | Read a note's full content |
| `search_notes`, `search_note_content` | Find notes by name or path, or search within note text |
| `create_note`, `edit_note`, `patch_note` | Create notes or update existing content |
| `query_dataview` | Run read-only DQL queries when Dataview is available |
| `read_pdf` | Extract text from a PDF URL or vault file |

**Approval Flow**: Read-only tools run directly. Vault-changing tools require approval by default; **Auto-Apply** can skip approval for supported workflows.

**Smart Results**: Tool outputs are formatted as markdown tables and lists before the AI sees them — no raw JSON dumps in your chat.

### Vault-Aware Context

- **`@mention` Notes** — Reference any note in chat.
- **Folder & Tag Context** — Attach folders or tags (returns file listings, not full contents — no token bloat).
- **Active Note** — Include the note you're currently editing.
- **Embed Expansion** — `![[...]]` embeds resolved recursively up to depth 2.

### Dataview Queries (Optional)

When the Dataview plugin exposes its query API, the agent can run read-only Dataview Query Language (DQL) queries against your vault. Queries and returned output are bounded. DataviewJS is not executed.

### Model Providers

Connect supported providers using API keys or account sign-in. Available providers include OpenAI, Codex, Anthropic, Google Gemini, DeepSeek, Kimi, Ollama, OpenRouter, Azure OpenAI, and custom OpenAI-compatible endpoints. Model availability depends on the provider and account. Codex account sign-in requires Obsidian 1.11.4 or newer.

- **Per-Provider Profiles** — Save multiple configurations and switch between them.
- **Model Discovery** — Fetch available models from your provider automatically.
- **Mid-Session Switching** — Change profile without starting a new chat.

### Web Search

Ask about recent events or facts beyond the model's training data:

- **5 Providers**: DuckDuckGo (free), Brave Search API, Tavily, Exa, SearXNG (self-hosted).
- **No extra setup** for DuckDuckGo — works immediately.
- **API keys** for Brave, Tavily, Exa entered in Settings.

### Session History & Search

- **Session History** — Save and restore conversations across Obsidian restarts; archive and rename past chats.
- **Past Session Search** — The `search_past_sessions` tool finds earlier conversations by topic, keyword, or content.

### Remote Sync

Sync chat sessions through WebDAV storage for cross-device access and backup. Start a manual sync with **Sync Now** in Settings.

### Agent Introspection

The `get_plugin_info` tool lets agents inspect the plugin's name, version, creator, and currently available capabilities, then answer questions about what they can do.

### Token Usage & Statistics

- **Context Usage** — See a visual indicator of the current context budget in chat.
- **Usage Statistics** — Review input and output token totals, usage by model, completed responses, and average response time in Diagnostics. Provider-reported usage is used when available; otherwise, the plugin shows estimates.

### Streaming & Quality-of-Life

- **Streaming Responses** — See generated text as it arrives; behavior varies by provider. Codex mobile responses appear after the request completes.
- **Abort** — Cancel streaming mid-generation.
- **Retry** — Regenerate a response with one click.

## ✨ Additional Features

### In Progress: Multi-User Chat

The optional WebSocket relay lets Chat Lab users on different devices join shared conversations. This feature is in progress and still needs full testing. You can run the relay on your own machine or server.

See [Multi-User Chat Design](memory-bank/implementation-details/multi-user-chat-design.md) for architecture details.

### Inline AI Editing

<p align="center">
  <img src="docs/demo.gif" alt="Inline AI Editing Demo" width="600">
</p>

- **Context-Aware Suggestions** — Highlight text or place your cursor, press `Ctrl/Cmd + K`, and get AI-powered transformations.
- **Visual Diff Preview** — See exactly what changed with inline markers for additions and deletions before you commit.
- **One-Click Apply / Discard** — Accept changes instantly or dismiss them without touching your note.
- **Custom Slash Commands** — Define your own system prompts and trigger them with `/` shortcuts.

For the complete, implementation-independent capability and behavior map of
the chat component, see the
[Chat Component Capability Map](memory-bank/implementation-details/chat-component-capability-map.md).

### Auto-Updater (v1.2.5+)

Stay current without manual downloads:

- **Automatic Update Checks** — Plugin checks for new releases on startup (configurable interval)
- **One-Click Update** — Notification shows latest version, commit message, and author; click to update
- **Stable / Dev Channels** — Switch between release builds and latest `main` branch
- **Manual Check** — Button in Settings to check immediately

### Debug & Diagnostics

- **Diagnostics Panel** — Memory usage, DOM nodes, chat sessions, total messages.
- **File-Based Logger** — Debug logs written to disk for troubleshooting.
- **Error Boundary** — Catches React render crashes, shows fallback UI.
- **Build Info in Settings** — Version badge, git commit hash, and branch name visible in Settings hero.

---

## 📦 Installation

### From Community Plugins (Recommended)

1. In Obsidian, open **Settings** → **Community plugins** → **Browse**.
2. Search for **Chat Lab AI** and select **Install**.
3. Enable Chat Lab AI in **Settings** → **Community plugins**.

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/space-cadet/obsidian-ai/releases)
2. Extract `main.js`, `styles.css`, and `manifest.json`
3. Copy them to your vault: `.obsidian/plugins/chat-lab/`
4. Enable in **Settings** → **Community plugins**.

---

## ⚡ Quick Start

### 1. Open the Chat Panel

Click the **💬** icon in the left ribbon (or run **"Open Chat Lab AI sidebar"** from the Command Palette).

### 2. Configure Your Provider

Open **Settings** → **Chat Lab: Obsidian AI** → **Provider Profiles**.

Click **Add Profile**, choose your provider, and enter:

- **API Key** (if required)
- **Model** — type a name or click **Fetch Models** to discover
- **Custom URL** (for OpenAI-compatible or other custom endpoints)

### 3. Chat with AI Agents

1. Select which AI profiles participate via the **👥** participant button
2. Type a message — all selected agents see it and can respond
3. Use `@AgentName` to route a message to a specific agent
4. Toggle **Zen Mode** (🧘) to hide all chrome

### 4. Edit Notes from Chat

When the AI generates content you want to keep:

- Click **Apply → Note** to diff-merge the response into the active note
- Click **Create Note** to save it as a new file
- Click **Append → Note** to add it to the end of an existing file

Or use slash commands in your message:

- `/create [[Note Name]]` — create a new note
- `/edit [[Note Name]]` — overwrite an existing note
- `/append [[Note Name]]` — append to an existing note

### 5. Agentic Tools

Ask the AI to manage your vault directly:

> "Summarize my `[[Project Notes]]` and create a draft in `Drafts/`"

The AI will:

1. Read `Project Notes` via `read_note`
2. Generate a summary
3. Create the draft via `create_note` — pending your approval (unless Auto-Apply is on)

### 6. Inline Editing (Optional)

1. Select text in any note (or place your cursor)
2. Press `Ctrl/Cmd + K` (customizable in Hotkeys)
3. Type your instruction — e.g. _"make this more concise"_ or _"translate to Spanish"_
4. Review the diff preview
5. Click **✓ Accept** to apply, or **✗ Discard** to cancel

### 7. Web Search (Optional)

Open **Settings** → **Web Search**. Choose a provider (DuckDuckGo works without setup). Now you can ask:

> "What happened in quantum gravity research this week?"

---

## 📱 Mobile Notes

Chat Lab: Obsidian AI works on mobile (iOS/Android), but there are platform-specific behaviors to be aware of:

### Background Execution

When the Obsidian app is moved to the background, the operating system suspends its webview to preserve battery. This means:

- **LLM streams pause** — Any in-progress response stops streaming and may fail
- **Tool calls abort** — Pending vault operations (create, edit, move) will not complete
- **Network requests cancel** — Any API calls in flight will be interrupted
- **Timers freeze** — JavaScript intervals and timeouts stop

**What persists:** Your chat history, session state, and context items are saved to local storage aggressively. When you return to the app, the conversation resumes exactly where you left it.

**Recommendation:** For long-running operations (large document analysis, multi-step tool workflows), keep the Obsidian app in the foreground. Use the **Abort** button if you need to pause mid-stream.

### Mobile-Responsive UI

The chat interface adapts to smaller screens:

- **Horizontal scrolling** for the action bar on narrow viewports
- **Auto-expanding textarea** for the input field
- **Compact icon buttons** to maximize message space
- **Zen mode** (hide all chrome) via the header toggle

---

## 🛠️ Development

```bash
# Clone
git clone https://github.com/space-cadet/obsidian-ai.git
cd obsidian-ai

# Install
pnpm install

# Dev build with hot reload
pnpm run dev

# Production build
pnpm run build

# Package release artifacts
pnpm run package

# Start the relay server
pnpm run relay
```

### Project Structure

```
src/
├── agent/               # Agent orchestration, tools, and execution
├── api/                 # Provider APIs, streaming, and response history
├── auth/                # Codex login and compatibility support
├── components/          # React chat interface
├── context/             # Vault context, attachments, and token budgeting
├── data/                # Plugin data management
├── hooks/               # Chat, session, context, and settings hooks
├── host/                # Obsidian and fixture chat hosts
├── integrations/        # Provider registry
├── intelligence/        # Memory, session summaries, and persona
├── lib/                 # Shared helpers, prompts, and usage statistics
├── lifecycle/           # Persistence and plugin sync lifecycle
├── modals/              # Login, migration, and sync dialogs
├── modules/             # Editor extensions and commands
├── noteEditing/         # Apply, append, and create note editing bridge
├── preview/             # Standalone chat UI preview
├── search/              # Saved-session search
├── settings-sections/   # Plugin settings UI
├── storage/             # Chat and session storage
├── sync/                # WebDAV storage and WebSocket relay sync
├── ui/                  # UI registration and events
├── updater/             # Plugin update support
├── utils/               # PDF extraction and export helpers
├── views/               # Obsidian chat view
├── api.ts               # Public chat/provider API
├── default_prompts.ts   # Built-in system prompts
├── logger.ts            # File-based logging
├── main.ts              # Plugin entry point
├── settings.ts          # Plugin settings and defaults
├── types.ts             # Shared data types
└── version-info.ts      # Generated build metadata

relay/
├── relay-server.js      # Relay server used by `pnpm run relay`
├── server.js            # Presence-aware WebSocket relay server
└── package.json         # Relay package metadata and scripts
```

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- **Bug Reports**: [Open an issue](https://github.com/space-cadet/obsidian-ai/issues)
- **Feature Requests**: [Start a discussion](https://github.com/space-cadet/obsidian-ai/discussions)
- **Showcase**: Share your workflows in [Discussions → Showcase](https://github.com/space-cadet/obsidian-ai/discussions/categories/showcase)

## Acknowledgments

This plugin was originally forked from [FBarrca/obsidian-inlineAI](https://github.com/FBarrca/obsidian-inlineAI) and has been significantly extended with chat, context, agentic tools, and multi-user/agent collaborative features.

Inspired by [Logan Yang](https://github.com/logancyang)'s excellent [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) plugin.

## License

Licensed under the [GPL-3.0 license](LICENSE).

---

<p align="center">
  Made with ❤️ for the Obsidian community
</p>
