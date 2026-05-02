# Obsidian AI Release Announcement Draft

Obsidian AI is an AI-powered assistant for Obsidian that combines fast inline editing with a persistent sidebar chat panel.

## Highlights

- Inline AI editing with accept/discard diff previews
- Persistent React-based chat panel
- Support for OpenAI, Ollama, Gemini, Azure OpenAI, and custom OpenAI-compatible endpoints
- Local packaging and GitHub release workflows for easier testing

## Installation

Download the latest release assets from GitHub Releases and copy `main.js`, `manifest.json`, and `styles.css` into:

```text
.obsidian/plugins/obsidian-ai/
```

Then enable Obsidian AI from Community Plugins in Obsidian settings.

## Community Plugin Submission

To submit to the official Obsidian Community Plugins directory:

1. Ensure the release includes `main.js`, `manifest.json`, and `styles.css`
2. Open a PR at [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
3. Follow the [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
4. Include a link to this repo and the latest release

## Acknowledgments

Obsidian AI builds on the original InlineAI plugin and takes UI inspiration from the Obsidian Copilot project.
