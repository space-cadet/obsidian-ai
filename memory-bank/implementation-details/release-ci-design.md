# Release System & CI/CD Design
*Created: 2026-05-02 09:34:00 IST*
*Last Updated: 2026-05-02 09:34:00 IST*

## Overview

Two-track release pipeline for the obsidian-ai plugin:

| Track | Trigger | Tag | Audience | Workflow |
|-------|---------|-----|----------|----------|
| Stable | Git tag push (`*`) | Version tag (e.g. `1.2.5`) | End users | `release.yml` |
| Dev pre-release | Push to `main` | `latest-dev` (rolling) | Developer testing | `pre-release.yml` |

---

## Stable Release Flow (`release.yml`)

```
developer: pnpm version patch  →  bumps package.json, manifest.json, versions.json
developer: git tag 1.2.5
developer: git push --tags
          ↓
GitHub Actions: release.yml triggered
  pnpm install --frozen-lockfile + pnpm run build
  package: main.js + manifest.json + styles.css → obsidian-ai.zip
  ncipollo/release-action → GitHub Release (tag: 1.2.5, prerelease: false)
```

Release assets published:
- `obsidian-ai.zip`
- `main.js`
- `manifest.json`
- `styles.css`

---

## Dev Pre-Release Flow (`pre-release.yml`)

```
developer: git push origin main
          ↓
GitHub Actions: pre-release.yml triggered
  pnpm install --frozen-lockfile + pnpm run build
  package: main.js + manifest.json + styles.css → obsidian-ai.zip
  ncipollo/release-action →
    tag: latest-dev
    prerelease: true
    allowUpdates: true      ← overwrites existing latest-dev release
    removeArtifacts: true   ← replaces old build artifacts
```

The `latest-dev` release is always the most recent `main` build. No new release is created per push — the same release entry is updated in place.

---

## Version Bumping Workflow

```bash
# 1. Bump version (updates package.json, manifest.json, versions.json)
pnpm version patch   # or minor / major

# 2. Push with tags to trigger stable release
git push && git push --tags
```

`version-bump.mjs` reads `minAppVersion` from `manifest.json` and writes the new version into both `manifest.json` and `versions.json`.

---

## versions.json

Maps plugin version → minimum Obsidian app version required.

```json
{
    "1.0.0": "0.15.0",
    "1.2.4": "0.15.0"
}
```

Must be updated whenever a new stable version is released (handled automatically by `pnpm version` + `version-bump.mjs`).

---

## CSS in Release Assets

Both workflows copy `styles.css` from the project root. During T1, chat styles will be written into `styles.css` (or imported and merged at build time). If esbuild CSS bundling is added later, the workflow copy step remains valid — no workflow changes needed.

---

## Manual Testing via Pre-Release

1. Push to `main`
2. Wait for Actions to complete (~1–2 min)
3. Go to GitHub Releases → "Dev Build (latest main)"
4. Download `main.js`, `manifest.json`, `styles.css`
5. Copy into your Obsidian vault's `.obsidian/plugins/obsidian-ai/` folder
6. Reload Obsidian (or disable/enable plugin)
