

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

### May 24 Bug Fixes

#### Profile Dropdown Single-Select (commit `15f6dc8`)

**Problem:** When exactly 1 profile was selected in the participant dropdown (checkbox list), the non-group-chat path ignored the selection and used the Settings default profile instead.

**Root cause:** The `handleSend` function's non-group-chat branch used `const activeProfile = resolvedProfile` unconditionally. The `selectedProfileIds` state was only consulted when `selectedProfileIds.size >= 2` (group chat path).

**Fix:** Added a check for `selectedProfileIds.size === 1` before falling back to `resolvedProfile`:

```typescript
const selectedIds = Array.from(selectedProfileIds);
const activeProfile: ProviderProfile =
    selectedIds.length === 1
        ? (plugin.settings.providerProfiles.find((p) => p.id === selectedIds[0]) ?? resolvedProfile)
        : resolvedProfile;
```

**Behavior:**
- 0 selected → `resolvedProfile` (Settings default)
- 1 selected → that profile from dropdown
- 2+ selected → group chat path (unchanged)

**File:** `src/components/ChatApp.tsx` (~line 915)

#### Auto-Scroll During Streaming (commit `8055cd5`)

**Problem:** Chat panel didn't auto-scroll while an agent was streaming a response. The scroll only happened when streaming started/stopped, not during the stream.

**Root cause:** The auto-scroll `useEffect` in `ChatMessages.tsx` had `isStreaming` in its dependency array. Since `isStreaming` is a boolean that only toggles (true → false → true), the effect didn't re-run during a single continuous stream. The state that changes every chunk is `currentAiMessage` (the accumulating response text).

**Fix:** Added `currentAiMessage` to the `useEffect` dependency array:

```typescript
useEffect(() => {
    if (isStreaming && isNearBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
}, [isStreaming, currentAiMessage]); // ← added currentAiMessage
```

**Preserved behavior:** Only auto-scrolls if `isNearBottomRef.current === true` (user hasn't scrolled up to read history).

**File:** `src/components/ChatMessages.tsx`

### May 24 Bug Fixes

#### Profile Dropdown Single-Select (commit `15f6dc8`)

**Problem:** When exactly 1 profile was selected in the participant dropdown (checkbox list), the non-group-chat path ignored the selection and used the Settings default profile instead.

**Root cause:** The `handleSend` function's non-group-chat branch used `const activeProfile = resolvedProfile` unconditionally. The `selectedProfileIds` state was only consulted when `selectedProfileIds.size >= 2` (group chat path).

**Fix:** Added a check for `selectedProfileIds.size === 1` before falling back to `resolvedProfile`:

```typescript
const selectedIds = Array.from(selectedProfileIds);
const activeProfile: ProviderProfile =
    selectedIds.length === 1
        ? (plugin.settings.providerProfiles.find((p) => p.id === selectedIds[0]) ?? resolvedProfile)
        : resolvedProfile;
```

**Behavior:**
- 0 selected → `resolvedProfile` (Settings default)
- 1 selected → that profile from dropdown
- 2+ selected → group chat path (unchanged)

**File:** `src/components/ChatApp.tsx` (~line 915)

#### Auto-Scroll During Streaming (commit `8055cd5`)

**Problem:** Chat panel didn't auto-scroll while an agent was streaming a response. The scroll only happened when streaming started/stopped, not during the stream.

**Root cause:** The auto-scroll `useEffect` in `ChatMessages.tsx` had `isStreaming` in its dependency array. Since `isStreaming` is a boolean that only toggles (true → false → true), the effect didn't re-run during a single continuous stream. The state that changes every chunk is `currentAiMessage` (the accumulating response text).

**Fix:** Added `currentAiMessage` to the `useEffect` dependency array:

```typescript
useEffect(() => {
    if (isStreaming && isNearBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
}, [isStreaming, currentAiMessage]); // ← added currentAiMessage
```

**Preserved behavior:** Only auto-scrolls if `isNearBottomRef.current === true` (user hasn't scrolled up to read history).

**File:** `src/components/ChatMessages.tsx`

### May 17 Updates

#### Message Metadata in Bubbles

**ChatMessage fields added:**
- `modelName?: string` — which model generated the response (e.g., "gpt-4o", "gemini-1.5-pro")
- `responseTimeMs?: number` — how long the stream took

**ChatApp.tsx tracking:**
- `streamStartTime` recorded when streaming begins
- On stream completion: `responseTimeMs = Date.now() - streamStartTime`
- `modelName` extracted from `resolvedProfile.model` (or `resolvedProfile.metadata?.model`)

**MessageBubble.tsx rendering:**
- Metadata row shown only for assistant messages (not user)
- Format: `modelName | responseTimeMs | estimatedTokens`
- CSS: `.chat-message-metadata` — flex row, small text, muted color

#### Profile Dropdown Mid-Session Switching

**Dropdown modes:**
- **1:1 mode** (`participants.length < 2`): Radio buttons — single selection
  - Clicking a profile switches `activeProviderProfileId` immediately
  - Updates `settingsTick` to force `resolvedProfile` re-computation
  - Saves settings to disk
  - Badge shows "1"
- **Council mode** (`participants.length >= 2`): Checkboxes — multi-selection (unchanged)
  - Badge shows participant count

**ActionBar badge fix:**
- Badge always shows at least 1 (was showing 0 in 1:1 mode)

#### SettingsTick Pattern

**Problem:** `resolvedProfile` useMemo cached old profile after dropdown switch.
**Solution:** Increment `settingsTick` when profile changes via dropdown.
```typescript
setActiveProviderProfileId(profileId);
setSettingsTick(t => t + 1); // Force re-computation
await plugin.saveSettings();
```

#### Retry Profile Fix

**Problem:** `handleSend` useCallback captured `resolvedProfile` but it wasn't in deps array.
**Solution:** Added `resolvedProfile` to dependency array.
```typescript
const handleSend = useCallback(async () => {
  // ... uses resolvedProfile ...
}, [isStreaming, plugin, orchestrator, isGroupChat, participants, typingAgents, resolvedProfile]);
```

---

*Last Updated: 2026-05-17 12:45 IST*
