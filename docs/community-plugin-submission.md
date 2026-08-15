# Community Plugin Submission Checklist

Obsidian community plugins require review before being listed. This checklist tracks readiness for submission to the official plugin directory.

## Repository Requirements

- [x] **Public repository** — `https://github.com/space-cadet/obsidian-ai`
- [x] **License** — GPL-3.0 (`LICENSE` file present)
- [x] **README** — Installation, features, screenshots, contributing (`README.md` present)
- [x] **manifest.json** — Valid plugin manifest at repo root
- [x] **Releases** — GitHub releases with `main.js`, `manifest.json`, `styles.css` attached
- [x] **No compiled code in source** — `main.js` is build output, not hand-edited

## Manifest Validation

```json
{
  "id": "obsidian-ai",
  "name": "Obsidian AI",
  "version": "1.2.5",
  "minAppVersion": "1.4.5",
  "description": "AI-powered suggestions, contextual edits, and advanced text transformations directly into your editor.",
  "author": "space-cadet",
  "authorUrl": "https://github.com/space-cadet/",
  "isDesktopOnly": false
}
```

- [x] `id` matches repo name (without `obsidian-` prefix)
- [x] `version` follows semver
- [x] `minAppVersion` is valid Obsidian version
- [x] `isDesktopOnly` is correct (false — mobile supported)

## Build & Distribution

- [x] **Lockfile committed** — `pnpm-lock.yaml` in repo
- [x] **CI/CD builds** — `.github/workflows/release.yml` builds on tag push
- [x] **Artifacts** — `main.js`, `manifest.json`, `styles.css` generated
- [x] **No external build dependencies** for users — download and copy

## Code Quality

- [x] **TypeScript** — Source in TypeScript with strict checking
- [x] **Tests** — Vitest suite (213 tests across 22 files)
- [x] **ESLint/Prettier** — Format check in CI (`.github/workflows/format.yml`)
- [x] **No eval() or unsafe dynamic code execution**
- [x] **No external network calls without user consent** — API keys required

## Security

- [x] **Path traversal protection** — `isPathAllowed()` blocks `.obsidian/`, `.trash/`, `../`
- [x] **XSS sanitization** — `sanitizeHtmlForRenderer()` strips scripts, event handlers
- [x] **SSRF validation** — `validateAgentUrl()` blocks localhost, private IPs
- [x] **No secrets in source** — API keys read from user settings only

## Documentation

- [x] **README** — Feature overview, installation, configuration
- [x] **CONTRIBUTING.md** — Development setup, bug report template
- [x] **CODE_OF_CONDUCT.md** — Community standards
- [x] **Issue templates** — Bug reports and feature requests
- [x] **PR template** — Pull request guidelines

## Submission Process

1. **Fork** `obsidianmd/obsidian-releases`
2. **Add plugin** to `community-plugins.json`:
   ```json
   {
     "id": "obsidian-ai",
     "name": "Obsidian AI",
     "author": "space-cadet",
     "description": "AI-powered chat with multi-device sync, agentic tools, and collaborative conversation",
     "repo": "space-cadet/obsidian-ai"
   }
   ```
3. **Create PR** with plugin added alphabetically
4. **Wait for review** — Obsidian team reviews within days to weeks

## Post-Submission

- [ ] Respond to review feedback promptly
- [ ] Update manifest.json version for new releases
- [ ] Tag releases to trigger CI build
- [ ] Monitor GitHub issues for bug reports

## Notes

- Plugin was originally forked from `FBarrca/obsidian-inlineAI` but has diverged significantly
- Multi-device sync uses self-hosted WebSocket relay (not a centralized service)
- Mobile support is fully implemented (responsive UI, touch interactions)
- BRAT distribution is currently the primary install method for beta users
