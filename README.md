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

> **🤖 AI-Powered Writing Assistant for Obsidian**
>
> Transform your Obsidian workflow with intelligent inline editing and a persistent AI chat panel. Highlight text for instant rewrites, chat with your vault using `@mentions`, and edit notes directly from the conversation — all without leaving your editor.

---

## ✨ Features

### Inline AI Editing

- **Context-Aware Suggestions** — Highlight text or place your cursor, press `Ctrl/Cmd + K`, and get AI-powered transformations
- **Visual Diff Preview** — See exactly what changed with inline markers for additions and deletions before you commit
- **One-Click Apply / Discard** — Accept changes instantly or dismiss them without touching your note
- **Custom Slash Commands** — Define your own system prompts and trigger them with `/` shortcuts

### Persistent Chat Panel

- **Sidebar Conversations** — Dedicated AI chat panel alongside your notes with full multi-turn dialogue
- **Session History** — Conversations are saved and restored across Obsidian restarts
- **Archive & Rename** — Organize past chats, prune old sessions automatically, and resume any conversation
- **Edit & Resubmit** — Fix a previous message and regenerate the response from that point

### Vault-Aware Context

- **`@mention` Notes** — Reference any note in your vault directly in chat
- **Folder & Tag Context** — Attach entire folders or all notes matching a tag to the conversation
- **Active Note** — Include the note you're currently editing as context with one toggle
- **Embed Expansion** — Inline embeds (`![[...]]`) are recursively resolved up to depth 2

### Note Editing from Chat

- **`/create`**, **`/edit`**, **`/append`** — Create new notes, rewrite existing ones, or append summaries directly from chat responses
- **Targeted Actions** — AI responses that look like edits show contextual buttons: *Apply → Note*, *Create Note*, *Append → Note*
- **Retry** — Regenerate a response if the first attempt wasn't right

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

- **Model Discovery** — Fetch available models from your provider instead of typing names manually
- **Per-Provider Profiles** — Save multiple provider configurations and switch between them instantly

### Quality-of-Life

- **Streaming Responses** — See AI output appear in real time, not after a long wait
- **Token Usage Indicator** — Visual feedback on how much context budget you're using (green → amber → red)
- **Context Limits** — Cap conversation history to stay within model context windows
- **Abort** — Cancel a streaming response mid-generation

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

## 🚀 Quick Start

### 1. Configure Your Provider

Open **Settings** → **Obsidian AI** → **Provider Profiles**.

Click **Add Profile**, choose your provider, and enter:
- **API Key** (if required by the provider)
- **Model** — type a model name, or click **Fetch Models** to discover available ones
- **Custom URL** (for Ollama or custom endpoints)

Switch between profiles anytime from the chat panel header.

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
├── components/          # React UI (ChatApp, ChatInput, MessageBubble, etc.)
├── context/             # ContextEngine, tokenEstimator, embedExpander
├── modules/             # Core CodeMirror extensions (inline tooltip, diff, commands)
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

---

## Acknowledgments

This plugin was originally forked from [FBarrca/obsidian-inlineAI](https://github.com/FBarrca/obsidian-inlineAI) and has been significantly extended with chat, context, and vault-aware features.

UI and design patterns inspired by [Logan Yang](https://github.com/logancyang)'s excellent [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) plugin.

---

## License

Licensed under the [GPL-3.0 license](LICENSE).

---

<p align="center">
  Made with ❤️ for the Obsidian community
</p>
