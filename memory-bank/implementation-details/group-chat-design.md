

---

## Post-MVP Updates (2026-05-16 afternoon)

### Phase 10: Mobile-Responsive UI + Zen Mode

**Zen Mode:**
- Toggle button (eye icon) in ActionBar
- When ON: hides ActionBar, participant bar, context bar — leaves only messages + input
- Floating "exit" button (eye-off icon) appears top-right
- CSS: `.chat-panel.is-zen` class with `display: none` on chrome elements

**Auto-Expand Textarea:**
- Starts at 1 line, grows to max 4 lines as user types
- `rows` attribute dynamically calculated from content
- Compact send/stop buttons: icon-only (▶ / ⏹)

**Mobile Optimizations:**
- Message action icons (copy, 👍/👎, speaker, share) always visible on touch devices
- Media query: `@media (hover: none) { .chat-message-actions { opacity: 1; } }`
- Tighter padding, smaller buttons, wider bubbles on `@media (max-width: 768px)`

### Phase 11–12: Participant Dropdown in ActionBar

**Replaced chip-based roster with dropdown:**
- Single `users` icon button in ActionBar with participant count badge
- Badge: `position: absolute; top: -4px; right: -4px;` colored circle with number
- Clicking opens dropdown below ActionBar wrapper

**Dropdown contents:**
- Checkbox per profile: `input[type="checkbox"]` + colored dot + name + model
- Check/uncheck any profile individually
- `is-selected` class for visual feedback
- Full-width on mobile (`left: 4px; right: 4px`)

**ActionBar mobile scroll:**
- `overflow-x: auto; scrollbar-width: none;` prevents wrapping to 2 rows
- All buttons accessible via horizontal swipe on narrow screens

### Phase 13: Hidden GroupChatView

- Separate `GroupChatView` and `GroupChatApp.tsx` commented out in `main.ts`
- Code preserved for potential future use
- All group chat functionality accessed through main `ChatApp`

### Phase 14: Debate Mode

**Orchestrator.debate() flow:**
```
User message
    │
    ▼
Round 1: dispatch() to all agents → yield each response
    │
    ▼
Add Round 1 responses to working thread
    │
    ▼
Round 2: For each agent:
    ├── Build prompt: "User asked: X. Other assistants said: Y. What would you add?"
    ├── sendToAgent() with working thread + prompt
    ├── If response is "PASS" (case-insensitive) → skip
    └── Otherwise → yield response
```

**System prompt reframing:**
- Old: "Respond naturally as yourself. If you have nothing to add, say so briefly."
- New: "You are [name], participating in a collaborative discussion... When asked to compare or review other assistants' perspectives, offer your own view — agree, disagree, add nuance, or correct errors."

**Debate toggle in ActionBar:**
- Shows only when `participantCount >= 2`
- Icons: `message-square` (off) / `message-circle` (on)
- Title: "🗣️ Debate mode OFF/ON"

### Phase 15–16: Participant Persistence

**Storage:**
- `ChatSession.participants` and `ChatSession.isGroupChat` saved via `saveChatData()`
- `useEffect` syncs `participants` state into active session whenever participants change

**Restore on load:**
- After loading sessions from disk, find active session → restore its participants
- `handleLoadSession`: setParticipants() BEFORE setActiveSessionId() (race condition fix)
- `handleDeleteSession`: same ordering when auto-switching to most recent session
- `handleNewChat`: clear participants for new empty sessions

**Race condition fix (971c63c):**
- Root cause: `activeSessionId` change triggers sync effect with OLD participant list
- Fix: setParticipants() before setActiveSessionId() so sync effect sees correct data

---

*Last Updated: 2026-05-16 16:20 IST*
