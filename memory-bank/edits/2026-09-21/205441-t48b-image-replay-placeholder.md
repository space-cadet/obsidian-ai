#### 20:54:41 IST - T48b: replay maps image parts to "[image attached]" text placeholder

**Action:** Modified
**Files:**
- Modified: src/lib/historyBuilder.ts (`buildReplayContent`: image parts of replayed `resolvedParts` → `{ type: "text", text: "[image attached]" }`)

Commit `f812c3f` (main, 2026-09-21 20:54 IST, afternoon session). Replayed
history carried raw image parts, so any later text-only send in an
image-containing conversation demanded an image-capable model. The persisted
transcript is never mutated — the placeholder applies only to the replay
payload; genuinely new attachments still send as images. Extends T48b's
canonical-serialization guarantee (replay payload is derived, bounded, and
now media-safe). Build green.
