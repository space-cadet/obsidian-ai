# Changelog
*Created: 2026-05-02 08:00:01 IST*
*Last Updated: 2026-05-02 11:12:44 IST*

*Tracks significant changes to the project. Newest first.*

---

## May 2026

### 2026-05-02 (Session 4) — Branding, Open Source Release Prep, Memory Sync [T8/META-1]

**Project identity:**
- Standardised current project identity as Obsidian AI / `obsidian-ai` / `space-cadet`
- Renamed chat view references to `ObsidianAIChatView.ts`
- Kept original InlineAI/FBarrca references only where they document project provenance

**Open source release prep:**
- Refreshed README with chat panel roadmap, pnpm development commands, and GPL-3.0 license wording
- Added CONTRIBUTING, CODE_OF_CONDUCT, issue templates, PR template, and release announcement draft
- Updated release workflows to use pnpm and added local `pnpm run package` workflow

**Memory bank:**
- Synced activeContext, session_cache, progress, tasks, T8, implementation docs, edit_history, and changelog

### 2026-05-02 (Session 3) — Release Pipeline and Chat Panel Scaffold [T7/T1]

**Completed:**
- T7 release system and CI/CD pre-release pipeline
- T1 React ItemView chat panel scaffold with components and styles

### 2026-05-02 (Session 2) — Architecture Documentation & v2.0 Task Definitions [META-1]

**Memory Bank:**
- Saved `integrated-rules-v6.12.md` (573 lines) to memory-bank/
- Created 5 implementation-detail documents with ASCII diagrams:
  - `current-architecture.md` — full state machine, module map, data flow
  - `proposed-architecture.md` — dual-surface design and component tree
  - `chat-panel-design.md` — ItemView, React component tree, ASCII UI layout
  - `context-system-design.md` — @mention pipeline and vault context injection
  - `note-editing-design.md` — 3 editing intents, NoteEditingBridge, reuse diagram
- Created task files T1–T6 for v2.0 feature development
- Updated projectbrief, productContext, techContext, systemPatterns with v2.0 scope

**Architecture decisions:**
- Dual-surface: inline tooltip (unchanged) + new chat panel sidebar
- NoteEditingBridge reuses existing CM6 effects — no new diff engine needed
- Plain CSS over Tailwind for chat panel (bundle size)
- No vector search in v2.0 scope (deferred)
- T4 (Streaming) to be implemented first (no dependencies)

### 2026-05-02 (Session 1) — Memory Bank Initialized [META-1]

- Created `memory-bank/` directory with all required subdirectories
- Initialised all 11 core memory bank files per integrated-rules-v6.12.md
- Documented project as Obsidian AI Plugin v1.2.4
- Branch: `claude/setup-memory-bank-Y9eIn`

---

## Project Version History (Pre-Memory-Bank)

| Version | Notes |
|---------|-------|
| 1.2.4 | Current release — inline-only, single-turn AI transforms |
| 1.2.3 | Previous release |
| — | Azure OpenAI support added |
| — | Focus guard for editor re-renders |
