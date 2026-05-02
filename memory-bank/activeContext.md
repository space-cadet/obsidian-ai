# Active Context

*Last Updated: 2026-05-02 17:08:57 IST*

## Current Focus
**Primary Task:** T4
**Secondary Tasks:** META-1, T10

## Active Tasks
- [T4]: Finish chat-panel streaming wiring, abort handling, and provider verification
- [META-1]: Keep memory-bank records aligned with the implemented T4/T9/T10 state
- [T10]: Queue the full model discovery service after T4 streaming UI work lands

## Implementation Focus
`src/api.ts`, `src/components/ChatApp.tsx`, `src/components/ChatInput.tsx`, `src/components/ChatMessages.tsx`, `src/settings.ts`, and the related memory-bank task/session records.

## Task-Specific Context

### Task T4
The LangChain to Vercel AI SDK migration is complete. `streamChat()` exists in the provider layer, but the React chat UI still needs to consume it, expose a working Stop action, and handle abort/error states cleanly.

### Task META-1
The memory bank now reflects the provider-profile foundation and migration work, but several files had drifted into mixed formats. The current maintenance slice is to keep the records in one canonical structure.

### Task T10
The settings UI already has a Fetch Models entry point and searchable picker shell. The remaining work is the provider-aware discovery service, caching, refresh/error states, and manual fallback behavior.

## Current Decisions
- Use the stricter `integrated-rules-v6.12.md` structure as the source of truth for task, session, registry, and edit-history files.
- Keep `pnpm` as the package-manager workflow for install, build, and package commands.
- Build T10 on top of the completed T9 provider-profile foundation rather than reintroducing flat provider settings.
- Preserve the existing inline tooltip flow while the chat-panel streaming path is completed.
- Keep diagnostics and model-discovery work sequenced after the current T4 streaming UI slice.

## Next Actions By Task
- [T4]: Wire `streamChat()` into the chat panel and verify stop/error handling.
- [META-1]: Keep task, session, registry, and history files in the canonical template format.
- [T10]: Implement provider-specific model fetchers and cache metadata after T4.
