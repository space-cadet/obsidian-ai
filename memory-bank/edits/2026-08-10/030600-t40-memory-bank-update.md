#### 03:06:00 IST - T40: Memory-bank restructuring

**Action:** Updated
**Scope:** memory-bank/ (presence-tracking.md, T40.md, activeContext.md)

**What changed:**
1. **presence-tracking.md** — Added comprehensive bug fix section (4 bugs found/fixed during session), callback ordering rule, screenshot of working dropdown UI, CSS file reference
2. **T40.md** — Trimmed from 200+ lines to high-level task tracker. Moved all implementation details to presence-tracking.md
3. **activeContext.md** — Condensed T40 section to ~10 lines with status + links to implementation doc
4. **assets/t40-remote-user-dropdown.jpg** — Added screenshot of working remote user dropdown

**Principle applied:** Implementation details live in `implementation-details/` docs, not in task files or active context.
