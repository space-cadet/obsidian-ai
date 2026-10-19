# Agent Instructions

Use the Memory Bank task hierarchy for project work. Check `memory-bank/tasks.md`,
`memory-bank/activeContext.md`, `memory-bank/session_cache.md`, and the relevant
task and implementation records before making changes. Update those records
when implementation or acceptance status changes.

## Non-Interactive Shell Commands

Use non-interactive flags with file operations to avoid confirmation prompts.

```bash
cp -f source dest
mv -f source dest
rm -f file
rm -rf directory
cp -rf source dest
```

Other commands that may prompt:

- `scp` - use `-o BatchMode=yes`
- `ssh` - use `-o BatchMode=yes`
- `apt-get` - use `-y`
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1`

## Session Completion

Before handing work off:

1. Update the relevant Memory Bank task and session records.
2. Run the relevant quality checks when code changed.
3. Review `git status` and the final diff.
4. Commit or push only when the user has requested or authorized it.
5. Summarize completed work, verification, and remaining follow-ups.

## Build & Test

Use the project package scripts for builds and tests. Redirect verbose output to
a temporary log and inspect concise diagnostics when a command fails.
