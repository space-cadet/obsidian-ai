# Release Readiness Audit — 2026-08-15

*Last Updated: 2026-08-15 13:19:00 IST*

## Decision

The subsequent Community Directory review of `1.3.2` found additional release blockers. This document's earlier local-readiness decision is superseded by child task T8a. See [Community review remediation](community-review-remediation.md) for the complete finding-by-finding plan and acceptance gates.

The implementation blockers are addressed locally for 1.3.1. Do not publish until the final artifact, dependency, and manual Obsidian smoke checks pass.

## Required sequence

1. **Identity and migration** — select a valid unique ID (`chat-lab` is the current recommendation). Update the manifest and ensure existing data under the old plugin ID is migrated or remains discoverable. Keep the repository name and GitHub URLs independent from the manifest ID.
2. **Memory safety** — make `memory.json` the source of truth; write a recoverable backup before AI prune; require confirmation after showing the proposed removal count; provide restore-last-prune. Use a temp/backup strategy so JSON and generated Markdown cannot silently diverge.
3. **Network compliance** — replace production `fetch()` calls with `requestUrl`; retain provider-specific headers and error handling; add tests for model discovery and each search-provider path.
4. **Disclosure and consent** — document exactly what data can leave the vault, which settings enable each destination, API-key handling, relay behavior, custom endpoints, agent read/write/delete tools, auto-approval, logging, and updater behavior. Keep destructive agent auto-approval disabled by default.
5. **Updater and rendering hardening** — review executable update integrity/confirmation and strengthen adversarial Markdown/HTML tests. Treat regex sanitization as defense in depth, not a complete security boundary.
6. **Release verification** — run tests, typecheck, production build, formatting, diff check, dependency audit, and a manual Obsidian smoke test. Then bump the version, build release assets, publish the matching GitHub release, and submit through Community Plugins.

## Findings

### Fixed

- `AIPruneModal` now immediately leaves the running state on cancel and cancels on unmount.
- `MemoryOptimizer` passes its abort signal through `ChatApiManager.callApi` to `generateText`.
- Abort errors are preserved, and regression coverage verifies signal propagation.

### Blocking

- The manifest ID is now `chat-lab`; existing data is copied from the legacy plugin directory before initialization and the legacy directory is retained.
- Non-streaming provider, model-discovery, search, and relay requests use `requestUrl`. The OpenResponses streaming POST remains on `fetch()` because replacing it would remove streaming semantics.
- README disclosure now covers provider, search, relay, vault-context, API-key, agent-tool, and updater behavior.
- AI pruning now requires confirmation after showing the proposed removal count, snapshots memory before saving, and offers restore-last-prune.
- Memory writes snapshot both JSON and generated Markdown before writes; JSON remains the source of truth and the snapshot can restore the pair.

### Recommended hardening

- Verify updater artifacts before replacing executable files and keep auto-update opt-in.
- Add adversarial renderer tests for links, embeds, HTML attributes, callouts, and Dataview-style content.
- Reduce production `as any`, global `window.app`, and inappropriate `Vault.modify` usage where the official checklist calls for safer APIs.

## Dependency audit blocker

`pnpm audit --prod` initially reported three vulnerabilities through `ollama-ai-provider@1.2.0`: two high-severity `nanoid` findings and one low-severity `@ai-sdk/provider-utils` finding. The npm registry has no newer provider release. Official Ollama integration was deferred; the vulnerable package was removed, local models remain available through custom OpenAI-compatible endpoints, and legacy Ollama profiles normalize to that path.

The Community directory rejected `Chat Lab: Obsidian AI` because manifest names may not contain “Obsidian” and may not use a colon. The valid directory name is now `Chat Lab AI`; “Obsidian AI” remains the product subtitle and UI branding. This requires release `1.3.2` so the default-branch manifest and release asset match.

## Verification snapshot

- 23 test files passed.
- 234 tests passed.
- Production build passed after the remediation changes.
- `git diff --check` passed; repository-wide Prettier check remains blocked by pre-existing formatting violations in unrelated files.
- Version is now being prepared as 1.3.1; publication remains pending final release validation.
- Production dependency audit currently fails with the Ollama vulnerability chain described above.
