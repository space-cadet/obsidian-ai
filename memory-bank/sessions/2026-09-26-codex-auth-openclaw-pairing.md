# 2026-09-26 — Codex auth and OpenClaw pairing direction

**Tasks:** T69, T69a, T14
**Branch / starting commit:** `main` / `e40085d50405c6a8f6a35723066b547c84c1d6d2`
**Scope:** Memory Bank planning update only; no source implementation or tests.

## Decisions recorded

- Desktop Codex subscription auth remains available without the Codex desktop
  GUI. Whether to use an installed Codex CLI or manage the app-server runtime
  remains open. Mobile auth and use must work without a connected desktop.
- Obsidian should be able to pair directly with a running OpenClaw Gateway on
  desktop and mobile. OpenClaw owns chat and tool execution; Obsidian is the
  chat frontend. Pair each device independently and keep its identity and
  pairing credentials out of sync and export data.
- The Gateway client is a separate transport from the existing OpenResponses
  HTTP path, which continues to execute tool calls against the local vault.
- Current source already serializes `previous_response_id` and sends the
  original OpenResponses request once. T14's claims that these defects remain
  were stale; live Gateway/provider behavior and broader transport acceptance
  remain open.

## Memory Bank changes

- Updated T69/T69a for distinct Codex desktop/mobile auth paths and the desktop
  no-GUI requirement.
- Expanded T14 and its implementation note to record paired Gateway chat as a
  separate remote mode and corrected the stale OpenResponses defect claims.
- Updated the task registry, shared auth design, active context, and session
  cache; created one canonical edit chunk.

## Follow-up

- Choose how the desktop Codex app-server runtime is supplied.
- Define Gateway address entry, pairing approval/revocation, reconnect/session
  behavior, streaming event mapping, and approval display.
- Run mobile Codex compatibility checks and per-device Gateway acceptance.

The local Beads commands report that no database is present, so this update did
not create a new Beads issue ID.
