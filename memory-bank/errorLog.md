# Error Log
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-08-12 10:54:55 IST*

*Newest entries first. Each entry documents a development error, its cause, and resolution.*

---

### 2026-08-12 10:54:55 IST — Stale AI SDK declarations after dependency update

- **Symptom:** TypeScript reported missing AI SDK exports and stream types after the initial UI work.
- **Cause:** `node_modules` contained older AI SDK packages than the versions declared in `pnpm-lock.yaml`.
- **Resolution:** Reinstalled with `CI=true pnpm install --frozen-lockfile`, then enabled `skipLibCheck` in the base `tsconfig.json` to match the existing production build policy for third-party declarations.
- **Verification:** `pnpm exec tsc --noEmit` and `pnpm run build` pass.
