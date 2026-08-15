# Community Directory Review Remediation — 1.3.3

*Created: 2026-08-15 13:19:00 IST*
*Last Updated: 2026-08-15 13:45:00 IST*
*Task: T8a (child of T8)*

## Review Evidence

The Community Directory review for version `1.3.2`, commit `056428c`, failed or warned on the following checks. This record preserves the findings from the supplied review PDF and the repository verification performed on 2026-08-15.

## Release and metadata findings

### Failed: missing release description

The reviewed GitHub release has no release notes. Add concise release notes describing user-visible changes, compatibility, migration, and deferred Ollama support.

### Failed: missing artifact attestations

The review reports missing attestations for `main.js` and `styles.css`. Add GitHub artifact attestations/provenance to CI and document how the published assets map to the tagged source commit.

### Failed: unsupported extra asset

The release contains `chat-lab.zip`. Publish only the assets accepted by the directory: `main.js`, `manifest.json`, and `styles.css` when present. Do not attach a plugin-directory zip unless the directory explicitly requests it.

### Warning: README/manifest name mismatch

The source at `056428c` has README title `Chat Lab AI` and manifest name `Chat Lab AI`. Rebuild from the exact release tag and inspect the downloaded artifact to rule out stale or mixed release assets before resubmission.

### Warning: build artifact mismatch

The reviewed release `main.js` differs from the review build. Fix the release workflow so it builds from the tag being released, uses a pinned Node/pnpm toolchain and frozen lockfile, records the source commit, and compares the CI artifact hash before upload.

## Behavior and policy findings

### Warning: direct filesystem access

`src/settings-sections/diagnostics.ts` imports Node `fs` and `path` via `require`. Replace this with a desktop-guarded dynamic import or an Obsidian adapter/API. Mobile execution must not load Node modules, and the feature must degrade clearly when unavailable.

### Warning: vault enumeration

The plugin enumerates vault files through Obsidian APIs. Keep this behavior, but disclose it clearly and ensure it occurs only for an explicit user action or feature requiring context.

### Warning: clipboard access

Clipboard read/write is present. Keep it user-initiated, disclose it, and avoid background clipboard reads.

## Source-code failures

### Error: unsupported Obsidian APIs

The manifest declares `minAppVersion: 0.15.0`, while the review lists many newer APIs across the agent, chat tabs, migration, note editing, settings, updater, and main entry point. Choose one explicit compatibility strategy:

1. Raise `minAppVersion` to the lowest version that supports all used APIs and test that version; or
2. Refactor every listed call to APIs available at `0.15.0`.

The first remediation batch raises the minimum version to `1.4.5`, matching the review environment's CSS/API baseline. This choice must be validated by the Community check and documented in release notes; if the checker identifies a newer required API, raise it again or refactor the specific call.

### Error: unsafe `innerHTML`

The review flags direct `innerHTML` assignments. Remove production assignments where content or attributes can be influenced by model, vault, relay, or user data. Use Obsidian `createEl`/`setText`, React rendering, or a vetted HTML sanitizer with a narrow allowlist. The first remediation batch removed production `innerHTML`; preview fixtures retain it only for their isolated browser harness.

### Error: direct style assignments

Replace static inline style assignments with CSS classes or CSS variables. The first remediation batch replaced production `.style.*` assignments with `setCssStyles`; preview-only stubs remain isolated.

### Error: undocumented directive comments

Every eslint-disable or equivalent suppression must state why it is required and why a safer alternative is not used. Remove stale suppressions.

### Error: navigator OS detection

Replace `navigator.platform`/user-agent OS detection with Obsidian's `Platform` API.

### Error: leaf detachment during unload

Remove `detachLeavesOfType()` from `onunload`; unloading should not reset a user's leaf placement.

### Warning: Node/dependency and code-quality items

Review the flagged `builtin-modules`, `dotenv`, and `lint-staged` packages; reduce production `any`/unsafe assignments; remove unnecessary console logging and unused symbols; fix unhandled promises, default hotkeys, deprecated settings APIs, and direct DOM helper violations. These are not all equal release blockers, but the final review should have an explicit disposition for each warning.

## Obfuscation and dynamic script finding

The review reports three dynamic `<script>` element creations. Repository text search found no application script loader. The original bundle contained React 19's `hoistableScripts` machinery; React was pinned to 18.3.1 and the rebuilt bundle no longer contains that marker. Remaining `<script` strings are React DOM compatibility code and the sanitizer pattern; no external script URL or script loader was found. Re-run the directory scan to confirm the finding is cleared.

## CSS findings

Remove duplicate declarations and unnecessary `!important`; replace unsupported browser features where practical; review `css-scrollbar`, `css3-attr`, `css-text-indent`, and unsupported preview-only CSS separately from shipped plugin CSS.

## Required verification gates

1. `pnpm install --frozen-lockfile` with Node `22.22.3`.
2. Unit/e2e tests, TypeScript check, production build, formatting, and diff check.
3. Production dependency audit.
4. Static policy scan with zero unresolved errors.
5. Build twice from the same tag and compare `sha256sum main.js manifest.json styles.css`.
6. Verify the release contains only supported assets, release notes, checksums, and attestations.
7. Manual desktop and mobile smoke tests: install, migration, chat/cancel, memory prune/restore, clipboard action, vault-tool approval, updater-disabled default, and diagnostics fallback.
8. Re-run Community Directory review before submitting `1.3.3`.

## Deferred/non-blocking items

Ollama integration remains deferred because of the previously documented production dependency vulnerability chain. Custom OpenAI-compatible endpoints remain supported. General type cleanup and deprecated API migration may be split into follow-up work only after every review error has an explicit safe disposition.
