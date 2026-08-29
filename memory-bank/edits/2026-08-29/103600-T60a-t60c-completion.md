# Edit Chunk: T60a/T60c completion

**Date:** 2026-08-29
**Tasks:** T60a, T60c, T46

## Changes

- Connected group-chat prompts and the approval card to the resolved tool
  descriptor data.
- Made provider enablement and read-only availability part of the shared
  descriptor resolution path.
- Added a bounded read helper with a maximum of eight simultaneous reads.
- Added shared target locks for conflicting mutations, including both sides
  of a note move and every note in a batch create.
- Added SHA-256 content fingerprints to `read_note` results and optional
  expected-fingerprint checks to existing-note mutations.
- Added focused safety tests and updated task and session records.

## Verification

- TypeScript compilation passed.
- Full test suite passed: 43 test files and 369 tests.
- T46 test pass was confirmed by the user; provider switching and real-provider
  acceptance remain separate runtime gates.
