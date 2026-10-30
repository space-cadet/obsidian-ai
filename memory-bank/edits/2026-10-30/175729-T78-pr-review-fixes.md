source_branch: feat/session-tags
source_commit: 4490f6b131d8ed54f5dca2cb21925a5755bce6f7

#### 17:57:29 IST - T78: Fix PR review findings for session tag generation

- Action `src/api.ts` - Preserve provider/client failures as explicit telemetry errors.
- Action `src/lib/sessionTags.ts` - Reject failed provider results instead of parsing their fallback text as tags.
- Action `src/components/ChatApp.tsx` - Merge suggestions into the latest shared session metadata after generation.
- Action `memory-bank/tasks/T78.md` - Record the review fixes and validation status.
- Action `memory-bank/implementation-details/session-tags.md` - Document the failure and concurrency behavior.
- Action `memory-bank/activeContext.md` - Record the current T78 review-fix status.
- Action `memory-bank/session_cache.md` - Record the latest work and verification.
- Action `memory-bank/sessions/2026-10-30-t78-pr-review-follow-up.md` - Record the review follow-up and open acceptance.
