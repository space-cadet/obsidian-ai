---
kind: edit_chunk
id: t11-t13-logger-errorboundary-tools-2026-05-09
created_at: 2026-05-09 11:51:05 IST
task_ids: [T11, T13]
source_branch: main
source_commit: af94281cea56923b19b762d0477f4eda93a2bfb9
---

#### 11:51:05 IST - T11: File debug logger, ErrorBoundary, crash debugging; T13: patch_note, edit_section, safety fixes

- Created `src/logger.ts` — `FileLogger` class writing all console output to `.obsidian/plugins/obsidian-ai/debug.log`. Intercepts `window.onerror` and `window.onunhandledrejection`. Logs memory metrics (`performance.memory`) every 10s. Exposes `window.__obsidianAiLogger` for React components. `flushNow()` and `scheduleFlush()` with 5MB max size.
- Modified `src/main.ts` — Logger initialized FIRST in `onload()` before any other setup; `clear-debug-log` command added; `logger.stopMemoryLogging()` and `logger.flushNow()` in `onunload()`.
- Created `src/components/ErrorBoundary.tsx` — `ChatErrorBoundary` React class component wrapping `ChatApp`. Catches render errors via `componentDidCatch`, logs to disk via `window.__obsidianAiLogger`, shows fallback UI with debug log path.
- Modified `src/views/ObsidianAIChatView.ts` — Wraps `ChatApp` in `<ChatErrorBoundary>` inside `onOpen()`.
- Modified `src/components/MessageBubble.tsx` — Added 5-step synchronous flush logging around `MarkdownRenderer.render` (Steps 1–5) to pinpoint exactly which sub-step crashes during streaming completion transition.
- Modified `src/components/ChatMessages.tsx` — `StreamingBubble` also has 5-step defensive logging around `MarkdownRenderer.render`. Added `unmounted` cleanup flag to abort stale render callbacks. Changed `scrollIntoView({ behavior: "smooth" })` to `"auto"` to mitigate Chromium `SIGTRAP` crash during rapid DOM mutations.
- Modified `src/agent/ToolExecutor.ts` — Implemented `patchNote()` (search/replace with `replace_all` option) and `editSection()` (rewrite content under a specific heading). Both use `resolveNote()` for basename resolution.
- Modified `src/modules/WidgetExtension.ts` — Added debug logging to `destroy()` and `acceptAction()` for crash tracing.
- Modified `src/modules/diffExtension.ts` — Added debug logging to `dispatchAIChanges()` and `applyDiffPlugin` effect handler.
- Modified `src/noteEditing/NoteEditingBridge.ts` — Wrapped `editorView.dispatch` in try/catch with detailed logging in `applyToNote()`. Added logging to `applyToTargetNote()` at every step (resolve, open, find leaf, apply).
- Rebuilt `main.js` at 2026-05-09 11:51:05 IST — verified all new code present in compiled output.
