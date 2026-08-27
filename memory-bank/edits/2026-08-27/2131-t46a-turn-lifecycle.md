#### 21:31 IST - T46a: Extract TurnLifecycle from useMessageActions

**Action**: Created, Modified

**Files**:
- Created: `src/agent/turnLifecycle.ts` — extracted ~1,400 lines of chat turn lifecycle from useMessageActions.ts
- Modified: `src/hooks/useMessageActions.ts` — slimmed to ~130-line thin wrapper delegating to TurnLifecycle
- Modified: `src/hooks/__tests__/useMessageActions.test.ts` — added `saveSettings: vi.fn()` to mockPlugin

**Details**:
- TurnLifecycle is a plain class with deps getter, framework-agnostic, no React dependencies in core logic
- Handles: send (group + single chat), stop, retry, edit, cancelEdit, approveTool, rejectTool
- Note actions (append, insert, apply, create) remain in hook since they are simple Obsidian API calls
- Commit: `bde9fea`
- Tests: 355/356 passing (1 pre-existing failure in tools.test.ts)
