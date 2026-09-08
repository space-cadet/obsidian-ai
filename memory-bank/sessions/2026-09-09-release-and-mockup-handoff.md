# 2026-09-09 — 1.5.0 Release and Onboarding Mockup Handoff

## Scope

Record the final release follow-up, acceptance-status corrections, and the
deferred onboarding mockup work from the preceding session.

## Release and scanner follow-up

- Rebased the `1.5.0` release onto the newer remote `main` history.
- Fixed the two Community scanner findings in `SettingsTab.ts`:
  static style assignments now use CSS classes, and the raw heading now uses
  an Obsidian `Setting` heading.
- Regenerated `styles.css`; tests, TypeScript, production build, packaging,
  and whitespace checks passed.
- Recreated and pushed the exact annotated tag `1.5.0`. Remote `main` and the
  dereferenced tag both resolve to `4a751b6`.
- T8b remains open until the corrected Community scan is confirmed clear.

## Acceptance-status corrections

- Real-provider acceptance is accepted and is no longer an open T46 blocker.
- Android Settings card-width behavior is accepted and is no longer an open
  T66 blocker.

## Onboarding mockup handoff

- Captured live Obsidian references for the sidebar, settings, provider
  profiles, model switcher, and chat history.
- Generated an exploratory multi-page welcome/onboarding mockup.
- The visual direction was explicitly deferred because it needs more work.
- No production implementation or approved design decision was made. Continue
  from the live references in the next session under T12.
