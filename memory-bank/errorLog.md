# Error Log
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-08-27 17:41:07 IST*

*Newest entries first. Each entry documents a development error, its cause, and resolution.*

---

### 2026-08-27 17:41:07 IST — Coordinator test mock construction

- **Symptom:** The new coordinator test failed because the mocked `AgentLoop`
  was not constructible with `new`.
- **Cause:** The test used a plain mock function for a class constructor.
- **Resolution:** Replaced it with a small constructible test class and reran
  the focused and full suites successfully.

---

### 2026-08-23 17:05:26 IST — Obsidian-AI/OpenClaw compaction context conflation

- **Symptom:** Initial test guidance mixed Obsidian-AI’s local compaction
  thresholds with the separate OpenClaw/Kimi long-context investigation.
- **Cause:** Two independent context-management systems were treated as if
  they shared the same threshold semantics.
- **Resolution:** Corrected the rationale to use Obsidian-AI’s local history
  estimate and verified the implementation against the merged source and live
  test. No source change was required.
- **Follow-up:** Keep Obsidian-AI validation evidence separate from the
  OpenClaw/Kimi investigation.

---

### 2026-08-12 10:54:55 IST — Stale AI SDK declarations after dependency update

- **Symptom:** TypeScript reported missing AI SDK exports and stream types after the initial UI work.
- **Cause:** `node_modules` contained older AI SDK packages than the versions declared in `pnpm-lock.yaml`.
- **Resolution:** Reinstalled with `CI=true pnpm install --frozen-lockfile`, then enabled `skipLibCheck` in the base `tsconfig.json` to match the existing production build policy for third-party declarations.
- **Verification:** `pnpm exec tsc --noEmit` and `pnpm run build` pass.
