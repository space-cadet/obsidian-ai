# Session 2026-10-21 — Obsidian Math Delimiters in Agent Prompts

## Objective

Ensure agents format LaTeX math with delimiters Obsidian renders, and check
whether users can inspect or edit the main system prompt.

## Findings and Changes

- Before the change, `buildSystemPrompt()` and `Orchestrator.buildSystemPrompt()`
  had no mathematical-formatting rule. The former provides the normal chat
  prompt; the latter builds the separate multi-agent prompt.
- Both prompts now require `$...$` inline and `$$...$$` on separate lines for
  display math, and avoid backslash-parenthesis/bracket delimiters.
- The main prompt is source-defined and has no Settings viewer or editor.
  `!debug history` does not show it: it builds model history with an empty
  system prompt and truncates displayed message previews to 200 characters.
  Settings expose narrower selection/cursor prompts, custom command prompts,
  and identity/persona context.

## Verification and Limits

- Prettier formatting and `pnpm run build` passed; the generated bundle
  contains both instructions.
- Tests and live Obsidian acceptance were not run. Changes remain local,
  uncommitted, and unpushed; reload is needed before runtime use.
- See the T43 follow-up and
  `memory-bank/implementation-details/multi-user-chat-design.md`.
