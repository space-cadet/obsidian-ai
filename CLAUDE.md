# Project Instructions for AI Agents

Use the Memory Bank task hierarchy for project work. Check `memory-bank/tasks.md`,
`memory-bank/activeContext.md`, `memory-bank/session_cache.md`, and the relevant
task and implementation records before making changes. Update those records
when implementation or acceptance status changes.

## Non-Interactive Shell Commands

Use non-interactive flags with file operations to avoid confirmation prompts:
`cp -f`, `mv -f`, `rm -f`, `rm -rf`, and `cp -rf`. Use `-o BatchMode=yes` for
`scp` and `ssh`, `-y` for `apt-get`, and `HOMEBREW_NO_AUTO_UPDATE=1` for `brew`.

## Session Completion

Before handing work off, update relevant Memory Bank records, run quality checks
when code changed, review `git status` and the final diff, commit or push only
when requested or authorized, and summarize completed work, verification, and
follow-ups.

## Build & Test

Use the project package scripts for builds and tests. Redirect verbose output to
a temporary log and inspect concise diagnostics when a command fails.
