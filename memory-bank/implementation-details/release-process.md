# Release Process

*Created: 2026-08-28*
*Last Updated: 2026-08-28*
*Task: T8 (Open Source Release)*

## Overview

This document consolidates the complete release workflow for the Chat Lab AI Obsidian plugin. It ties together version management, CI/CD, pre-release verification, Community Directory submission, and distribution strategy.

**Related docs:**
- `release-ci-design.md` — CI/CD pipeline details
- `release-readiness-audit.md` — 2026-08-15 audit findings
- `community-review-remediation.md` — T8a review findings and fixes
- `systemPatterns.md` — Versioning convention

---

## Version Scheme

See `systemPatterns.md` § Versioning Convention for full details.

**Summary:**
- **Release:** SemVer (`1.4.0`), tag = version (no `v` prefix), must match manifest
- **Dev builds:** `{NEXT_VERSION}-{BRANCH_TAG}.{SHORT_SHA}`
  - `main` → `1.4.0-dev.5db4e1d`
  - `release/1.4.0` → `1.4.0-rc.5db4e1d`
  - `feat/t46` → `1.4.0-feat-t46.5db4e1d`
- `main` manifest stays at last release version; dev versions computed at build time

---

## Release Types

| Type | Trigger | Tag | Audience | Workflow |
|------|---------|-----|----------|----------|
| **Stable** | Git tag push | `1.4.0` | End users | `release.yml` |
| **Dev pre-release** | Push to `main` | `latest-dev` (rolling) | Developer testing | `pre-release.yml` |

---

## Pre-Release Verification Gates

**Must pass before tagging a stable release.**

Derived from `release-readiness-audit.md` and `community-review-remediation.md`.

### 1. Build Verification
```bash
# Pinned toolchain: Node 22.22.3, pnpm (frozen lockfile)
pnpm install --frozen-lockfile
pnpm run build        # Production build
pnpm run test         # Full test suite
pnpm run typecheck    # TypeScript
pnpm run format       # Prettier
git diff --check      # No trailing whitespace
```

### 2. Reproducible Build
```bash
# Build twice from same tag, compare hashes
sha256sum main.js manifest.json styles.css
# Must match between builds
```

### 3. Dependency Audit
```bash
pnpm audit --prod     # Zero unresolved vulnerabilities
```
**History:** Ollama provider (`ollama-ai-provider@1.2.0`) had `nanoid` vulns. Removed; custom OpenAI-compatible endpoints remain.

### 4. Static Policy Scan
- Zero `innerHTML` in production code
- Zero direct `style.*` assignments (use `setCssStyles` or CSS classes)
- No `navigator.platform` OS detection (use Obsidian `Platform` API)
- No `detachLeavesOfType()` in `onunload`
- Every `eslint-disable` has explanatory comment
- No Node `fs`/`path` imports on mobile paths

### 5. Asset Validation
Release must contain **only**:
- `main.js`
- `manifest.json`
- `styles.css` (if present)

**Do NOT attach:** `chat-lab.zip`, extra assets, unbuilt source.

### 6. Manifest Compliance
- `id`: `chat-lab` (not `obsidian-ai`, not containing "Obsidian" or colon)
- `name`: `Chat Lab AI` (directory name)
- `minAppVersion`: matches lowest API used (raised to `1.4.5` after review)
- `version`: matches git tag exactly

### 7. Documentation
- `CHANGELOG.md` updated with user-visible changes
- `README.md` accurate (no "Obsidian" in title, no false sync claims)
- Release notes on GitHub describing changes, compatibility, migration

### 8. Manual Smoke Tests
- Desktop: install, migration, chat, cancel, memory prune/restore
- Mobile: clipboard, vault-tool approval, updater-disabled default, diagnostics fallback
- Updater: verify dev channel commit-hash comparison works

---

## Stable Release Workflow

```bash
# 1. Ensure all gates pass (see above)

# 2. Bump version (updates package.json, manifest.json, versions.json)
pnpm version minor   # or patch / major

# 3. Commit and tag
git add -A
git commit -m "(release) Bump version to 1.4.0"
git tag 1.4.0
git push && git push --tags

# 4. CI triggers release.yml
#    - Builds with frozen lockfile
#    - Packages main.js + manifest.json + styles.css
#    - Creates GitHub Release with release notes
#    - Adds artifact attestations
```

---

## Dev Pre-Release Workflow

```bash
# Push to main triggers pre-release.yml automatically
git push origin main

# CI:
#   - Builds from latest main
#   - Updates (overwrites) the 'latest-dev' release
#   - Tag: latest-dev, prerelease: true
#   - Commit hash embedded in build for updater comparison
```

---

## Community Directory Submission

### Current Status (as of 2026-08-15)
- **T8a review:** Passed for `1.3.4` (commit `cac9688`)
- **Previous blockers:** Manifest name contained "Obsidian", `minAppVersion` too low, `innerHTML`, direct style assignments, missing release notes, extra assets
- **All resolved** per `community-review-remediation.md`

### Submission Process
1. Publish matching GitHub release (version tag, release notes, correct assets, attestations)
2. Submit through Obsidian Community Directory (not PR to obsidian-releases — upstream disabled PRs)
3. Wait for review; address findings via T8a remediation workflow
4. On approval, directory listing goes live

### Naming Rules (enforced by directory)
- Plugin name may NOT contain "Obsidian"
- Plugin name may NOT contain colon (`:`)
- Repository name and manifest ID are independent
- Valid: `Chat Lab AI` (directory), "Chat Lab: Obsidian AI" (UI subtitle)

---

## Distribution Strategy

| Channel | Method | Audience | Update Mechanism |
|---------|--------|----------|------------------|
| **Stable** | GitHub Release + Community Directory | End users | Built-in auto-updater (stable channel) |
| **Dev** | GitHub pre-release (`latest-dev`) | Developers, testers | Built-in auto-updater (dev channel) |
| **BRAT** | Manual BRAT plugin install | Beta testers | BRAT's own update mechanism |

**Notes:**
- Auto-updater is disabled on mobile by default
- GitHub API rate limit: 60 req/hr unauthenticated
- BRAT is separate from the built-in updater — BRAT for beta testing, built-in updater for end users

---

## Release Checklist (Copy for each release)

- [ ] All verification gates pass
- [ ] `CHANGELOG.md` updated
- [ ] Version bumped in `manifest.json`, `package.json`, `versions.json`
- [ ] Git tag matches manifest version (no `v` prefix)
- [ ] GitHub Release has release notes
- [ ] Only `main.js`, `manifest.json`, `styles.css` attached
- [ ] Artifact attestations present
- [ ] Desktop smoke test passed
- [ ] Mobile smoke test passed
- [ ] Community Directory submission prepared

---

## Historical Releases

| Version | Date | Key Changes |
|---------|------|-------------|
| 1.4.1 | 2026-08-28 | Community Review blocking errors fixed (API compatibility, CSS class refactor) |
| 1.4.0 | 2026-08-28 | Orchestration decomposition (T46), context efficiency (T48/T62/T64), tool hardening (T60), sync system (T43/T58) |
| 1.3.5 | 2026-08-16 | Last release before 1.4.0 cycle |
| 1.3.4 | 2026-08-15 | Community Directory review passed |
| 1.3.3 | 2026-08-15 | Review remediation (T8a) |
| 1.3.2 | 2026-08-XX | Rejected: manifest name contained "Obsidian" |

---

## Known Issues & Deferred Work

- **Ollama integration:** Deferred due to `nanoid` vulnerability chain. Custom OpenAI-compatible endpoints remain supported.
- **Plugin data rebuild:** T58d — separate plugin-data rebuild phase not yet implemented (chat-session rebuild only)
- **Telemetry:** T51 implemented but opt-in only; no data collected without explicit consent

## Lessons Learned

### 2026-08-28: Tag naming — "v" prefix breaks Obsidian release matching

**Mistake:** Created GitHub release tag as `v1.4.1` instead of `1.4.1`.

**Consequence:** Obsidian Community Directory rejected the release with:
> "No release matches your manifest version. Your manifest.json points at a version that doesn't have a matching GitHub release."

**Root cause:** Obsidian requires the GitHub release tag to **exactly match** the manifest `version` field. The manifest had `"version": "1.4.1"`, but the release was tagged `v1.4.1`.

**Fix:** Deleted the `v1.4.1` release and tag, recreated as `1.4.1` (no "v" prefix).

**Prevention:** The convention was already documented in this file ("tag = version (no `v` prefix)"), but the muscle memory from git conventions (`git tag v1.0.0`) overrode it. Future releases: use `pnpm version` which bumps manifest and creates the correct tag automatically, or double-check tag name before pushing.

