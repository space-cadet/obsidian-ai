<h1 align="center">Obsidian AI</h1>

<p align="center">
  <a href="https://github.com/space-cadet/obsidian-ai">GitHub</a>
  ·
  <a href="https://github.com/space-cadet/obsidian-ai/issues">Report Bug</a>
  ·
  <a href="https://github.com/space-cadet/obsidian-ai/discussions">Discussions</a>
</p>

<p align="center">
  <img src="docs/demo.gif" alt="Obsidian AI Demo" width="600">
</p>

---

> **🤖 AI-Powered Assistant for Obsidian**
>
> An AI chat panel that can read, edit, create, and organize your Obsidian notes — with support for multiple AI agents in a single conversation. Bring your own API keys. Your data stays in your vault.

---

## ✨ What It Does

Obsidian AI adds a **persistent chat panel** to your Obsidian sidebar. Unlike typical chat plugins, this one can **directly manipulate your vault** through native tool calling — search notes, edit content, create files, move documents, and more — all from the conversation.

It also supports **group chat mode**: talk to multiple AI agents (different models or remote agents) in the same thread, with each agent aware of the conversation context.

And it includes **inline AI editing**: highlight text in any note, press a hotkey, and get AI-powered transformations with a visual diff preview before you commit.

---

## 🚀 Features

### Inline AI Editing

- **Context-Aware Suggestions** — Highlight text or place your cursor, press `Ctrl/Cmd + K`, and get AI-powered transformations
- **Visual Diff Preview** — See exactly what changed with inline markers for additions and deletions before you commit
- **One-Click Apply / Discard** — Accept changes instantly or dismiss them without touching your note
- **Custom Slash Commands** — Define your own system prompts and trigger them with `/` shortcuts

### Agentic Note Editing (13 Tools)

The AI can directly manage your vault through structured tool calls:

| Tool | What It Does |
|------|-------------|
| `read_note` | Read any note's full content |
| `edit_note` | Overwrite a note with new content |
| `append_to_note` | Add content to the end of a note |
| `create_note` | Create a new note in any folder |
| `patch_note` | Find-and-replace inside a note |
| `edit_section` | Rewrite content under a specific heading |
| `search_notes` | Search by filename or path |
| `list_notes` | Browse folders with subfolder support |
| `get_note_metadata` | File stats (size, dates, word count) |
| `create_folder` | Create new folders |
| `move_note` | Move or rename notes |
| `delete_note` | Delete notes (to system trash) |
| `list_folders` | Navigate vault structure |

**Approval Flow**: By default, every tool call shows a preview card in chat — you approve or reject before it executes. Toggle **Auto-Apply** (🤖) to skip approval for trusted workflows.

**Smart Results**: Tool outputs are formatted as markdown tables and lists before the AI sees them — no raw JSON dumps in your chat.

### Group Chat / Council Mode

Talk to multiple AI agents in one conversation:

- **Multi-Agent Panel** — Select which profiles participate via checkbox dropdown
- **Sequential Dispatch** — Agents respond one after another, building on previous answers
- **Debate Mode** — Agents see each other's responses and can add follow-ups (or pass)
- **Mention Routing** — `@Cloudy fetch arxiv` sends that request only to Cloudy
- **Identity Badges** — Each agent gets a colored dot and name label on their messages
- **Zen Mode** — Hide all chrome, see only messages and input
- **Mobile-Responsive** — Works on tablet and phone layouts

### Vault-Aware Context

- **`@mention` Notes** — Reference any note in chat
- **Folder & Tag Context** — Attach folders or tags (returns file listings, not full contents — no token bloat)
- **Active Note** — Include the note you're currently editing
- **Embed Expansion** — `![[...]]` embeds resolved recursively up to depth 2

### Web Search

Ask about recent events or facts beyond the model's training data:

- **5 Providers**: DuckDuckGo (free), Brave Search API, Tavily, Exa, SearXNG (self-hosted)
- **No extra setup** for DuckDuckGo — works immediately
- **API keys** for Brave, Tavily, Exa entered in Settings

### Multi-Provider Support

Bring your own keys. No data leaves your machine unless you choose it to.

| Provider | Models | Local / Cloud |
|---|---|---|
| **OpenAI** | GPT-4o, GPT-4, GPT-3.5 | Cloud |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus | Cloud |
| **Google** | Gemini 1.5 Pro, Gemini Flash | Cloud |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | Cloud |
| **OpenRouter** | 200+ models via unified endpoint | Cloud |
| **Ollama** | Llama, Mistral, Qwen, and more | **Local** |
| **Azure OpenAI** | Enterprise GPT models | Cloud |
| **Custom** | Any OpenAI-compatible endpoint | Either |

- **Per-Provider Profiles** — Save multiple configurations and switch between them
- **Model Discovery** — Fetch available models from your provider automatically
- **Mid-Session Switching** — Change profile without starting a new chat

### Streaming & Quality-of-Life

- **Streaming Responses** — See output appear in real time
- **Token Usage Indicator** — Visual feedback on context budget (green → amber → red)
- **Session History** — Conversations saved and restored across restarts
- **Archive & Rename** — Organize past chats, auto-name sessions
- **Abort** — Cancel streaming mid-generation
- **Retry** — Regenerate a response with one click

### Debug & Diagnostics

- **Diagnostics Panel** — Memory usage, DOM nodes, chat sessions, total messages
- **File-Based Logger** — Debug logs written to disk for troubleshooting
- **Error Boundary** — Catches React render crashes, shows fallback UI

---

## 📦 Installation

### From Obsidian Community Plugins (recommended)

1. Open **Settings** → **Community Plugins**
2. Turn off **Safe Mode** if it's enabled
3. Click **Browse** and search for **"Obsidian AI"**
4. Click **Install**, then **Enable**

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/space-cadet/obsidian-ai/releases)
2. Extract `main.js`, `styles.css`, and `manifest.json`
3. Copy them to your vault: `.obsidian/plugins/obsidian-ai/`
4. Enable in **Settings** → **Community Plugins**

---

## ⚡ Quick Start

### 1. Configure Your Provider

Open **Settings** → **Obsidian AI** → **Provider Profiles**.

Click **Add Profile**, choose your provider, and enter:
- **API Key** (if required)
- **Model** — type a name or click **Fetch Models** to discover
- **Custom URL** (for Ollama or custom endpoints)

### 2. Inline Editing

1. Select text in any note (or place your cursor)
2. Press `Ctrl/Cmd + K` (customizable in Hotkeys)
3. Type your instruction — e.g. *"make this more concise"* or *"translate to Spanish"*
4. Review the diff preview
5. Click **✓ Accept** to apply, or **✗ Discard** to cancel

### 3. Chat Panel

1. Click the **💬** icon in the left ribbon (or run **"Open Obsidian AI Chat"** from the Command Palette)
2. Ask questions, brainstorm, or request help writing
3. Use `@` to mention notes, folders, or tags for vault-aware answers
4. Toggle **Active Note** in the context bar to include the note you're editing

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

### 6. Group Chat (Optional)

Click the **👥** participant button in the chat header. Select multiple profiles. Type a message — all selected agents will respond.

Toggle **Debate Mode** (🗣️) to have agents discuss each other's responses.

### 7. Web Search (Optional)

Open **Settings** → **Web Search**. Choose a provider (DuckDuckGo works without setup). Now you can ask:

> "What happened in quantum gravity research this week?"

---

## 📱 Mobile Notes

Obsidian AI works on mobile (iOS/Android), but there are platform-specific behaviors to be aware of:

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
```

### Project Structure

```
src/
├── agent/               # Agentic tool calling: AgentLoop, ToolExecutor, tools, types
│   ├── AgentLoop.ts     # Multi-step tool calling orchestration
│   ├── ToolExecutor.ts  # Vault operation handlers (13 tools)
│   ├── tools.ts         # Zod tool definitions
│   ├── types.ts         # StreamEvent union, ToolCall, ToolResult
│   └── Orchestrator.ts  # Multi-agent dispatch for group chat
├── components/          # React UI (ChatApp, ChatInput, MessageBubble, PendingToolCard, etc.)
├── context/             # ContextEngine (vault context assembly, token estimation)
├── core/                # ChatEngine, useChat hook, streaming logic
├── adapters/            # LLMAdapter, ToolAdapter, RAGAdapter, PersistenceAdapter
├── modules/             # CodeMirror extensions (inline tooltip, diff, commands)
├── noteEditing/         # NoteEditingBridge (apply, append, create from chat)
├── views/               # Obsidian ItemView registration
├── api.ts               # Provider abstractions & streaming
├── settings.ts          # Plugin settings & configuration UI
├── default_prompts.ts   # Built-in system prompts
└── main.ts              # Plugin entry point
```

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- **Bug Reports**: [Open an issue](https://github.com/space-cadet/obsidian-ai/issues)
- **Feature Requests**: [Start a discussion](https://github.com/space-cadet/obsidian-ai/discussions)
- **Showcase**: Share your workflows in [Discussions → Showcase](https://github.com/space-cadet/obsidian-ai/discussions/categories/showcase)

## Acknowledgments

This plugin was originally forked from [FBarrca/obsidian-inlineAI](https://github.com/FBarrca/obsidian-inlineAI) and has been significantly extended with chat, context, agentic tools, and multi-agent features.

UI and design patterns inspired by [Logan Yang](https://github.com/logancyang)'s excellent [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) plugin.

## License

Licensed under the [GPL-3.0 license](LICENSE).

---

<p align="center">
  Made with ❤️ for the Obsidian community
</p>
