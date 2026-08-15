# Mobile Chat UI Redesign — Proposed Changes

## Current Problems (from Screenshot)

| Element          | Issue                                                   | Height Used |
| ---------------- | ------------------------------------------------------- | ----------- |
| Action Bar       | Buttons + profile chip wrap to 2 rows on narrow screens | ~70px       |
| Participant Bar  | Full chips with × buttons take entire width             | ~36px       |
| Context Bar      | "+ Active note" chip below chat                         | ~32px       |
| Input Area       | Fixed-height textarea + Resubmit/Cancel buttons         | ~80px       |
| **Total Chrome** |                                                         | **~218px**  |
| **Chat Area**    | (~60% of screen)                                        |             |

**Goal: Reclaim ~80–100px for the chat area**

---

## Proposal A: Compact Participant Bar (✓ Approved)

**Before:**

```
[💎 Gemini] [×] [🤖 OpenRouter] [×] [👤 Tailscale] [×]
```

**After:**

```
👥 3 agents  ▼
```

- Single compact chip showing count + "agents"
- Tap to expand into full roster with remove buttons
- Saves: ~28px (from multi-chip row to one chip)

---

## Proposal B: Auto-Expand Input (✓ Approved)

**Before:**

```
┌─────────────────────────────┐
│  Type your message...       │  ← fixed 2–3 lines
│                             │
└─────────────────────────────┘
[Resubmit] [Cancel]  [Send ▶]
```

**After:**

```
┌─────────────────────────────┐
│ Type your message...        │  ← starts at 1 line
└─────────────────────────────┘
                        [▶]
```

- Textarea starts at 1 line, grows to max 4 lines as you type
- **Hide Resubmit/Cancel** when no stale message exists
- Send button as compact circle (or inline at right edge of textarea)
- Saves: ~30–40px when idle, ~20px when typing

---

## Proposal C: Context Bar Removal (✓ Your Call)

**Question:** If context is passed inline via `@note.md`, and context doesn't persist across messages, is the context bar needed?

**Current behavior:**

- Context bar shows: "📎 Active note" or "+ Add context"
- Clicking opens context picker modal
- Context is **per-message**, not sticky

**Proposed:** Remove the context bar entirely. Instead:

- Use `@` inline to add context to a specific message
- Show a small inline hint below input: "Tip: type @ to mention notes"
- Or add a **📎 paperclip icon** inside the input bar (like WhatsApp) for quick context add

**Saves:** ~32px

**Alternative (if you want to keep it):**

- Ultra-compact: single pill "📎 2" (tap to expand)
- Auto-fade after 3 seconds
- Saves: ~24px (from 32px to ~8px)

---

## Proposal D: Zen Mode / Focus Toggle (✓ Approved)

**Trigger:** Swipe down on chat area, or a small 👁️ button in action bar

**Zen Mode hides:**

- Action bar (except minimal back/close)
- Participant bar
- Context bar (if kept)

**Shows:**

- Messages (full width)
- Minimal floating input bar at bottom
- Small dot to exit zen mode

**Saves:** ~120px when active

---

## Combined Impact

| Change                  | Height Saved | Cumulative Chat Area |
| ----------------------- | ------------ | -------------------- |
| Baseline                | —            | ~60%                 |
| Compact participant bar | +28px        | ~65%                 |
| Auto-expand input       | +30px        | ~70%                 |
| Remove context bar      | +32px        | ~75%                 |
| Zen mode (toggle)       | +120px       | ~90%                 |

---

## What You Said Yes To

- ✅ **A** — Compact participant bar
- ✅ **B** — Auto-expand input
- ❓ **C** — Remove context bar? (waiting for your call)
- ✅ **D** — Zen mode

## What You Said No To

- ❌ Collapse action bar buttons (doesn't save vertical space)
- ❌ Shrink message headers (useful info)

---

## My Recommendation

Implement **A + B + (C if you agree) + D**.

For **C**: I'd vote to **remove the context bar** and rely on `@` inline + a 📎 icon in the input area. The context bar is the least useful piece of chrome — context is transient per-message, so a persistent bar showing "+ Active note" is confusing. The `@` notation is the natural replacement.

**Shall I proceed with A + B + (remove context bar) + D?**
