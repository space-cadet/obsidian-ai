# Contributing to Obsidian AI

Thanks for helping improve Obsidian AI. This project is an Obsidian plugin, so small, focused changes with clear manual test notes are easiest to review.

## Development Setup

```bash
pnpm install
pnpm run dev
pnpm run build
```

For local Obsidian testing, copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/obsidian-ai/` inside a test vault.

## Reporting Bugs

Please include:

- Obsidian version
- Obsidian AI version
- Operating system
- AI provider and model, if relevant
- Steps to reproduce
- Expected behavior and actual behavior
- Console errors or screenshots, if available

Do not include API keys, vault-private note content, or other secrets in issues.

## Suggesting Features

Describe the workflow you want to support, why it matters, and any alternatives you considered. For chat or note-editing features, mention whether the behavior should affect the persistent chat panel, the inline editor tooltip, or both.

## Pull Requests

- Keep changes focused on one feature or fix.
- Run `pnpm run build` before opening a PR.
- Update docs or memory-bank notes when behavior, architecture, or release process changes.
- Preserve the existing inline tooltip behavior unless the PR intentionally changes it.
- Add manual test notes for Obsidian UI changes.

## Code Style

Use the existing TypeScript and plain CSS style. The chat panel intentionally avoids Tailwind to keep the plugin bundle small.
