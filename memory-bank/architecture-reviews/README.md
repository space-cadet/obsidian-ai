# Architecture review archive

This directory retains the read-only architecture reviews for `obsidian-ai`.

| Review timestamp | Checkout | Report |
|---|---|---|
| 2026-08-27T12:47:00+05:30 | `main` before the T46/T46a refactor | [2026-08-27T12-47-architecture-review.html](2026-08-27T12-47-architecture-review.html) |
| 2026-08-29T16:48:06+05:30 | `main` at `63bce58` | [2026-08-29T16-48-06+0530-architecture-review.html](2026-08-29T16-48-06+0530-architecture-review.html) |

## Current review summary

The August 29 review found:

1. **Strong:** Make model-history policy one deep module.
2. **Worth exploring:** Narrow the interface around the now-large `TurnLifecycle` module.
3. **Worth exploring:** Finish capability ownership across built-in and provider tools.
4. **Speculative:** Separate sync reconciliation from transfer mechanics.

The August 27 report remains the historical baseline. The August 29 report
records which of its findings were addressed by the T46/T46a work and which
remain open.
