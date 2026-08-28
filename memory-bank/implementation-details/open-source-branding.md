# Open Source Release & Branding Guide
*Created: 2026-05-02 11:00:39 IST*
*Last Updated: 2026-08-28 16:24 IST*

## Overview

This document outlines the branding identity and release infrastructure for the Chat Lab AI Obsidian plugin.

**Note:** Repository name (`space-cadet/obsidian-ai`) is independent from plugin directory identity (`Chat Lab AI`). See `release-process.md` for the full release workflow.

## Branding Identity

| Element | Value | Notes |
|---------|-------|-------|
| Directory Name | **Chat Lab AI** | Obsidian Community Directory name (no "Obsidian", no colon) |
| Product Subtitle | Obsidian AI | UI branding, README subtitle |
| Plugin ID | `chat-lab` | Manifest `id` field |
| Author | space-cadet | GitHub handle |
| Repository | `space-cadet/obsidian-ai` | GitHub repo (kept for continuity) |
| Previous Names | InlineAI → Obsidian AI → Chat Lab AI | Evolution documented in memory-bank |

## Repository Structure

```
obsidian-ai/
├── .github/
│   ├── workflows/
│   │   ├── release.yml          # Stable releases
│   │   ├── pre-release.yml      # Dev builds
│   │   └── format.yml           # Code formatting
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml       # Bug report form
│   │   └── feature_request.yml  # Feature request form
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── FUNDING.yml
├── src/                         # Source code
├── docs/
├── memory-bank/                 # Development documentation
├── manifest.json                # Obsidian plugin manifest
├── package.json
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
└── styles.css
```

## Required File Templates

### manifest.json
```json
{
    "id": "chat-lab",
    "name": "Chat Lab AI",
    "version": "1.4.0",
    "minAppVersion": "1.4.5",
    "description": "AI-powered assistant for Obsidian with inline editing and persistent chat",
    "author": "space-cadet",
    "authorUrl": "https://github.com/space-cadet/",
    "isDesktopOnly": false
}
```

**Critical:** `id` must be `chat-lab`. The Community Directory rejects names containing "Obsidian" or colons.

### package.json
```json
{
    "name": "obsidian-ai",
    "version": "1.4.0",
    "description": "Chat Lab AI — AI-powered assistant for Obsidian",
    "author": "space-cadet",
    "repository": {
        "type": "git",
        "url": "https://github.com/space-cadet/obsidian-ai.git"
    },
    "license": "GPL-3.0",
    "keywords": ["obsidian", "obsidian-plugin", "ai", "chat", "openai"]
}
```

## README.md Requirements

Required sections:
1. **Hero** — "Chat Lab AI" as title, "Obsidian AI" as subtitle/tagline
2. **Features** — Key capabilities with screenshots/GIFs
3. **Installation** — Community plugin store + manual install
4. **Setup** — Configuration instructions
5. **Usage** — Inline AI and chat panel
6. **Configuration** — Settings explanation
7. **Development** — Build from source
8. **Contributing** — Link to CONTRIBUTING.md
9. **License** — GPL-3.0 reference
10. **Support** — Issues, discussions, funding

## Branding Consistency Rules

1. **Directory/Plugin Name:** Always "Chat Lab AI" in manifest, Community Directory, command palette
2. **Product Subtitle:** "Obsidian AI" may appear in UI subtitle, README tagline
3. **Plugin ID:** Use `chat-lab` in manifest (kebab-case, no "obsidian")
4. **Repository:** Keep `space-cadet/obsidian-ai` (GitHub URL continuity)
5. **Comments:** Update legacy "InlineAI" / "Obsidian AI" references to "Chat Lab AI"
6. **Documentation:** Use consistent terminology — "Chat Lab AI" for the plugin, "Obsidian" for the host app

## Release Checklist

See `release-process.md` for the complete checklist and verification gates.

Quick reference:
- [ ] All tests passing
- [ ] Build completes without errors
- [ ] README accurate (no "Obsidian" in title, no false claims)
- [ ] `CHANGELOG.md` updated
- [ ] Version bumped in manifest/package/versions.json
- [ ] Git tag matches manifest version
- [ ] Only `main.js`, `manifest.json`, `styles.css` in release
- [ ] Community Directory submission prepared

## Post-Release Actions

1. **Obsidian Community Directory** — Submit through official form (not PR)
2. **GitHub Release** — Publish with release notes, artifact attestations
3. **Reddit/Discord** — Announce in Obsidian communities
4. **Auto-updater** — Verify stable channel detects new release

## Open Source Best Practices

- **Semantic Versioning:** Follow semver
- **Changelog:** Maintain `CHANGELOG.md` each release
- **Security:** No API keys in code; use settings
- **Privacy:** Document data handling (see `release-readiness-audit.md` § Disclosure)
- **Accessibility:** Consider screen reader support
- **Internationalization:** Structure for future i18n
