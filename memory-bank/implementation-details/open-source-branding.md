# Open Source Release & Branding Guide
*Created: 2026-05-02 11:00:39 IST*
*Last Updated: 2026-05-02 11:12:44 IST*

## Overview

This document outlines the complete process for releasing the obsidian-ai plugin as an open source project with proper branding, documentation, and community infrastructure.

## Branding Identity

| Element | Current | Target |
|---------|---------|--------|
| Plugin Name | InlineAI | Obsidian AI |
| Plugin ID | `inlineai` | `obsidian-ai` |
| Author | FBarrca | space-cadet |
| Repository | FBarrca/obsidian-inlineAI | space-cadet/obsidian-ai |
| Display Name | InlineAI | Obsidian AI |

## Repository Structure for Open Source

```
obsidian-ai/
├── .github/
│   ├── workflows/
│   │   ├── release.yml          # Stable releases
│   │   ├── pre-release.yml        # Dev builds
│   │   └── format.yml             # Code formatting
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml         # Bug report form
│   │   └── feature_request.yml    # Feature request form
│   ├── PULL_REQUEST_TEMPLATE.md   # PR template
│   └── FUNDING.yml                # Sponsor links
├── src/                           # Source code
├── docs/                          # Additional documentation
├── memory-bank/                   # Development documentation
├── manifest.json                  # Obsidian plugin manifest
├── package.json                   # NPM configuration
├── README.md                      # Main documentation
├── LICENSE                        # License file
├── CONTRIBUTING.md                # Contribution guidelines
├── CODE_OF_CONDUCT.md             # Community standards
├── CHANGELOG.md                   # Version history
└── styles.css                     # Plugin styles
```

## Required File Updates

### 1. manifest.json
```json
{
    "id": "obsidian-ai",
    "name": "Obsidian AI",
    "version": "1.2.4",
    "minAppVersion": "1.4.5",
    "description": "AI-powered assistant for Obsidian with inline editing and persistent chat",
    "author": "space-cadet",
    "authorUrl": "https://github.com/space-cadet/",
    "isDesktopOnly": false
}
```

### 2. package.json
```json
{
    "name": "obsidian-ai",
    "version": "1.2.4",
    "description": "AI-powered assistant for Obsidian with inline editing and persistent chat",
    "author": "space-cadet",
    "repository": {
        "type": "git",
        "url": "https://github.com/space-cadet/obsidian-ai.git"
    },
    "license": "GPL-3.0",
    "keywords": ["obsidian", "obsidian-plugin", "ai", "chat", "ollama", "openai"]
}
```

### 3. README.md Sections

Required sections for open source release:

1. **Hero Section** - Plugin name, badges, one-line description
2. **Features** - Key capabilities with screenshots/GIFs
3. **Installation** - Community plugin store + manual install
4. **Setup** - Configuration instructions
5. **Usage** - How to use inline AI and chat panel
6. **Configuration** - Settings explanation
7. **Development** - How to build from source
8. **Contributing** - Link to CONTRIBUTING.md
9. **License** - License reference
10. **Support** - Issues, discussions, funding

### 4. LICENSE
Chosen license:
- **GPL-3.0**: Copyleft, requires derivatives to be open source

### 5. CONTRIBUTING.md

Standard sections:
- Code of Conduct reference
- How to report bugs
- How to suggest features
- Development setup
- Pull request process
- Coding standards

### 6. GitHub Templates

**Bug Report** (`ISSUE_TEMPLATE/bug_report.yml`):
- Obsidian version
- Plugin version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots
- Console errors

**Feature Request** (`ISSUE_TEMPLATE/feature_request.yml`):
- Problem description
- Proposed solution
- Alternatives considered
- Additional context

## Code Branding Updates

### Files Already Updated (Uncommitted)
- `src/main.ts` - View import path
- `src/components/ActionBar.tsx` - Import path
- `src/components/ChatApp.tsx` - Import path
- `src/modules/diffExtension.ts` - Comments
- `src/views/InlineAIChatView.ts` → `src/views/ObsidianAIChatView.ts`
- `manifest.json` - Plugin ID/name/author metadata
- `package.json` - Package metadata and `pnpm run package`
- `README.md` - Public docs and development commands
- `.github/FUNDING.yml` - Sponsorship identity
- `.github/workflows/*.yml` - Release/check workflows use pnpm
- `memory-bank/*` - Current task, implementation, and release documentation

### Remaining Review Items
- Decide whether to keep `package-lock.json` alongside `pnpm-lock.yaml`
- Decide whether generated local artifacts under `dist/` should be deleted after packaging tests
- Run final build verification before release

## Release Checklist

Before going public:

- [ ] All tests passing (if any exist)
- [x] Build completes without errors
- [x] README is complete and accurate
- [x] License file added
- [x] Contributing guidelines written
- [x] Issue templates created
- [x] PR template created
- [x] Code of conduct added
- [x] FUNDING.yml updated
- [ ] Screenshots/GIFs in README
- [x] Changelog up to date
- [x] Memory bank reflects new branding
- [ ] Git history is clean (no secrets committed)

## Post-Release Actions

1. **Obsidian Community Plugins**: Submit to official plugin directory
2. **Reddit/Discord**: Announce in Obsidian communities
3. **GitHub Topics**: Add relevant topics to repository
4. **Release Notes**: Write detailed release notes for v1.2.4
5. **Future Roadmap**: Document planned features in README or ROADMAP.md

## Branding Consistency Rules

1. **Plugin Name**: Always "Obsidian AI" (not "ObsidianAI" or "obsidian-ai")
2. **Plugin ID**: Use kebab-case in manifest (e.g., "obsidian-ai")
3. **Repository**: Keep simple and memorable
4. **Comments**: Update all "InlineAI" references to "Obsidian AI"
5. **Documentation**: Use consistent terminology throughout

## Open Source Best Practices

- **Semantic Versioning**: Follow semver for version bumps
- **Changelog**: Maintain CHANGELOG.md with each release
- **Security**: No API keys in code; use settings
- **Privacy**: Document data handling (AI provider interactions)
- **Accessibility**: Consider screen reader support
- **Internationalization**: Structure for future i18n
