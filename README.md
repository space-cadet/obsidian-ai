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
> Transform your Obsidian workflow with intelligent inline editing and a persistent AI chat panel. Get contextual suggestions, rewrite content, and have full conversations with your vault—all without leaving your editor.

---

## ✨ Features

### **Inline AI Editing**

- **Context-Aware Suggestions**: Highlight text or place your cursor, press `Ctrl/Cmd + K` to get AI-powered transformations
- **Visual Diff Preview**: See exactly what changed with inline markers for additions and deletions
- **One-Click Apply**: Accept or discard suggestions instantly
- **Custom Commands**: Define your own system and transformation prompts for personalized workflows

### **Persistent Chat Panel** (New in v2.0)

- **Sidebar Chat**: Dedicated AI conversation panel alongside your notes
- **Conversation History**: Multi-turn chats that persist across sessions
- **Vault Context**: Reference your notes with `@mention` support
- **Streaming Responses**: Real-time AI output for better responsiveness

### **Multi-Provider Support**

- **OpenAI** (GPT-4, GPT-3.5)
- **Ollama** (Local models for privacy)
- **Google Gemini**
- **Custom API endpoints**

---

## 📦 Installation

### **From Obsidian Community Plugins**

1. Open **Settings** → **Community Plugins**
2. Turn on **Safe Mode** if it's enabled
3. Click **Browse** and search for "Obsidian AI"
4. Click **Install**, then **Enable**

### **Manual Installation**

1. Download the latest release from [GitHub Releases](https://github.com/space-cadet/obsidian-ai/releases)
2. Extract `main.js`, `styles.css`, and `manifest.json`
3. Copy to your vault: `.obsidian/plugins/obsidian-ai/`
4. Enable in **Settings** → **Community Plugins**

---

## 🚀 Quick Start

### Setup

1. **Configure your AI provider**:
    - Open **Settings** → **Obsidian AI**
    - Select your provider (OpenAI, Ollama, Gemini, etc.)
    - Enter your API key or local endpoint

2. **Choose a model**:
    - OpenAI: `gpt-4`, `gpt-4o`, `gpt-3.5-turbo`
    - Ollama: `llama3.2`, `mistral`, etc.
    - Gemini: `gemini-pro`, `gemini-flash`

### Usage

**Inline Editing**:

1. Select text or place cursor
2. Press `Ctrl/Cmd + K` (customizable hotkey)
3. Type your instruction (e.g., "make this more concise")
4. Review the diff and click ✓ to apply or ✗ to discard

**Chat Panel**:

1. Click the **message-square** icon in the ribbon
2. Or use the command palette: "Open Obsidian AI Chat"
3. Ask questions, get help writing, or discuss your notes

---

## 🛠️ Development

### Setup

```bash
# Clone the repository
git clone https://github.com/space-cadet/obsidian-ai.git
cd obsidian-ai

# Install dependencies
pnpm install

# Development build with hot reload
pnpm run dev

# Production build
pnpm run build

# Package release artifacts locally
pnpm run package
```

### Project Structure

```
src/
├── components/          # React UI components (Chat panel)
├── modules/            # Core functionality
│   ├── AIExtension.ts  # Inline AI tooltip
│   ├── diffExtension.ts # Diff visualization
│   └── commands/       # Slash commands
├── views/              # Obsidian views
└── main.ts            # Plugin entry
```

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- **Bug Reports**: [Open an issue](https://github.com/space-cadet/obsidian-ai/issues)
- **Feature Requests**: [Start a discussion](https://github.com/space-cadet/obsidian-ai/discussions)
- **Showcase**: Share your workflows in [Discussions](https://github.com/space-cadet/obsidian-ai/discussions/categories/showcase)

---

## 📋 Roadmap

- [x] Inline AI editing with diff visualization
- [x] Persistent chat panel (React-based)
- [ ] Streaming responses
- [ ] Conversation history & memory
- [ ] `@mention` vault note references
- [ ] In-place note editing from chat
- [ ] Token usage tracking

---

## Acknowledgments

This plugin was originally forked from [FBarrca/obsidian-inlineAI](https://github.com/FBarrca/obsidian-inlineAI) and has been significantly extended with new features.

UI and design patterns inspired by [Logan Yang](https://github.com/logancyang)'s excellent [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) plugin.

---

## License

Licensed under the [GPL-3.0 license](LICENSE).

---

<p align="center">
  Made with ❤️ for the Obsidian community
</p>
