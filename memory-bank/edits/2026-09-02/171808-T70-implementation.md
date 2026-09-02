#### 17:18:08 IST - T70: Implement active-tab model identity

- Modified `src/lib/sessionProfile.ts` to resolve explicit session overrides,
  agent-scoped legacy assistant models, and profile defaults with provenance.
- Modified `src/components/ChatApp.tsx`, `ChatToolbar.tsx`, `ActionBar.tsx`,
  and `ModelSwitcher.tsx` so the picker consumes parent-resolved profiles.
- Modified `src/agent/Orchestrator.ts`, `ParticipantRouter.ts`, and
  `turnLifecycle.ts` to persist and use model metadata consistently.
- Modified model-switcher and chat styles to share standard toolbar sizing.
- Modified resolver and picker tests; 51 test files / 446 tests pass.
- Updated T70 task, implementation note, active context, progress, session
  cache, and changelog. Packaged-runtime verification remains pending.
