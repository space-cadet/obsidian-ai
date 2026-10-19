# Edit Chunk: T33 Desktop Chat View Singleton Repair

*Date: 2026-08-04*

## Modified

- `src/main.ts` — reconcile restored duplicate chat leaves, serialize activation, and preserve one canonical chat sidebar leaf.
- `memory-bank/tasks/T33.md` — task contract and verification.
- `memory-bank/implementation-details/chat-view-singleton.md` — lifecycle and persistence boundary.

## Validation

- `pnpm run build` passed.
- `git diff --check` passed.

## Notes

The project Memory Bank records this work in its task hierarchy.
