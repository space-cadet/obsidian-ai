# Multi-User and Agent Chat Architecture

*Created: 2026-08-10*
*Status: ✅ COMPLETE — All 5 Phases Delivered and Merged*
*Depends on: T40 (Multi-User Chat with LaTeX Support)*

## Overview

This document describes the **equal-footing participant model** for multi-user chat, where AI agents and remote human users participate as peers in the same chat tab.

## Core Principle

**All participants are equal.** Whether AI agent, remote human, or local user — each receives messages and decides independently how to respond.

## Participant Types

```typescript
type Participant =
  | { type: "agent"; agentId: string; name: string; color: string }
  | { type: "remote"; userId: string; name: string }
  | { type: "local"; userId: string; name: string };
```

| Type | Added Via | Behavior |
|------|-----------|----------|
| **Agent** | Agent dropdown | Receives messages, generates responses via AI API |
| **Remote** | User dropdown (from relay roster) | Receives messages via WebSocket relay |
| **Local** | Implicit (always present) | Sends messages, sees all activity |

## Message Routing

### Send Flow (Local User)

```
User sends message M in Tab T
    │
    ├──► For each AGENT in T.participants:
    │    ├── Build context: all messages in T (including remote)
    │    ├── Add participant list to system prompt
    │    └── Call AI API ──► Agent may respond
    │
    ├──► For each REMOTE USER in T.participants:
    │    └── Send M via WebSocket relay ──► Remote user receives
    │
    └──► Local display: add M to T.messages
```

### Receive Flow (Remote User)

```
Remote message R arrives via relay
    │
    ├──► Add R to Tab T.messages (with remote: true, fromUserId: sender)
    │
    ├──► For each AGENT in T.participants:
    │    └── Include R in next AI context
    │        (agent sees: "User Alice said: ...")
    │
    └──► Display R in UI with remote user styling
```

## ChatMessage Extension

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: string;       // For agent messages
  agentName?: string;     // For agent messages
  agentColor?: string;    // For agent messages
  
  // NEW: Remote user fields
  remote?: boolean;       // True if message came via relay
  fromUserId?: string;    // Sender's userId (for remote messages)
  
  timestamp: Date;
}
```

## Session State Extension

```typescript
interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  agentIds: string[];           // AI agents in this tab
  remoteUsers: string[];        // NEW: Remote users in this tab
  relayEnabled: boolean;
  relayRoomId: string;
  // ... other fields
}
```

## AI Context Rules

### What Agents See

1. **All messages** — including remote user messages
2. **Participant list** — who's in the room
3. **Message attribution** — who said what

Example agent prompt context:
```
You are participating in a chat with:
- User Alice (human, remote)
- User Bob (human, remote)
- You (AI assistant)

Conversation:
[10:00] Alice: Hi everyone!
[10:01] Bob: Hey Alice, what's up?
[10:02] You: Hello! I'm here to help.
```

### Building Context

```typescript
// In useMessageActions.ts — buildAIContext()
const contextMessages = session.messages
  .slice(-maxContextMessages)
  .map((m) => {
    if (m.remote) {
      // Remote user message
      return {
        role: "user",
        content: `[${m.fromUserId}]: ${m.content}`
      };
    }
    // ... existing agent/local handling
  });
```

## UI Changes

### Tab Configuration

```
┌─────────────────────────────────────┐
│ Tab: Physics Discussion             │
├─────────────────────────────────────┤
│ Agents: [Gemini ▼] [Kimi ▼]        │
│ Users:  [Alice ▼] [Bob ▼]          │ ← NEW
│                                      │
│ [x] Enable Relay                     │
│ Room: physics-101                    │
└─────────────────────────────────────┘
```

### Message Bubbles

- **Agent messages**: Existing styling (color-coded, avatar)
- **Remote user messages**: New styling (colored dot + sender name, e.g., "👤 samsung-tab")
- **Local user messages**: Existing styling ("You" label)

### Presence Indicator

- Radio icon (📻) shows connected users from relay
- Click to see who's online
- Online users can be added to tab via dropdown

### Participant Bar (Phase 5c)

Persistent bar below ActionBar showing all active participants:

```
┌─────────────────────────────────────────────┐
│ 🤖 Gemini  🔴  🤖 Kimi  🟢  👤 samsung-tab  🟢 │
└─────────────────────────────────────────────┘
```

- Each selected agent appears with its colored dot
- Each remote/connected user appears with a green dot
- Group chat logic (orchestrator) still only activates with 2+ agents or remote users

### Typing Indicators (Phase 5b)

When a remote user is typing:

```
┌─────────────────────────────────────────────┐
│                                             │
│  samsung-tab is typing…                     │
│                                             │
└─────────────────────────────────────────────┘
```

- SyncAdapter interface extended with `sendTyping()` and `onTyping()`
- WebSocketSyncAdapter sends `{type: "typing", sender: userId}` via relay
- 3-second auto-clear in ChatApp.tsx
- 2-second throttled emitter in ChatInput.tsx

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Tab T: "Physics Chat"                     │
│                                                             │
│  Participants: [Gemini, Alice(remote), Bob(remote), You]    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Gemini     │  │    Alice     │  │     Bob      │      │
│  │   (Agent)    │  │   (Remote)   │  │   (Remote)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         │                  │                  │              │
│    AI API              WebSocket           WebSocket        │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                │
│                     ┌──────┴──────┐                         │
│                     │ Relay Server│                         │
│                     │  (ws://...) │                         │
│                     └──────┬──────┘                         │
│                            │                                │
│  ┌─────────────────────────┼─────────────────────────┐      │
│  │                         │                         │      │
│  ▼                         ▼                         ▼      │
│ ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│ │ Local State  │    │   Client Y   │    │   Client Z   │   │
│ │ (Your Tab)   │    │ (Alice's Tab)│    │  (Bob's Tab) │   │
│ └──────────────┘    └──────────────┘    └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Human-Only Tabs

A tab with **zero agents** operates in **relay-only mode**:

```typescript
if (session.agentIds.length === 0 && session.remoteUsers.length > 0) {
  // Relay-only mode: send to relay, skip AI
  await syncAdapter.sendMessage(msg);
  // No AI API call
}
```

Use cases:
- Private chat between two humans
- Group chat with no AI assistance
- Future: file sharing, voice calls

Implementation: relay-only dispatch is implemented in `ParticipantRouter`.
When a tab has selected remote users but no AI profiles, the router sends the
message through the active `SyncAdapter` and skips the AI orchestrator.

## Phase 5 Implementation Details

### Phase 5a: Message Attribution

**Problem:** Remote messages showed "You" as sender, same as local user.
**Solution:** MessageBubble.tsx now checks `fromUserId` and displays it with a colored dot for remote messages.

**Before:**
```
You: Hello from mobile
```

**After:**
```
🔴 samsung-tab: Hello from mobile
```

### Phase 5b: Typing Indicators

**SyncAdapter interface extension:**
```typescript
interface SyncAdapter {
  // ... existing methods
  sendTyping?(): void;
  onTyping?(callback: (userId: string) => void): void;
}
```

**WebSocketSyncAdapter implementation:**
```typescript
sendTyping() {
  this.ws.send(JSON.stringify({ type: "typing", sender: this.userId }));
}

onTyping(callback) {
  this.ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "typing" && data.sender !== this.userId) {
      callback(data.sender);
    }
  });
}
```

**ChatApp.tsx typing state:**
```typescript
const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

// Auto-clear after 3 seconds
useEffect(() => {
  if (typingUsers.size === 0) return;
  const timer = setTimeout(() => setTypingUsers(new Set()), 3000);
  return () => clearTimeout(timer);
}, [typingUsers]);
```

**ChatInput.tsx throttled emitter:**
```typescript
const lastTypingTime = useRef(0);
const TYPING_COOLDOWN = 2000; // 2 seconds

function emitTyping() {
  const now = Date.now();
  if (now - lastTypingTime.current > TYPING_COOLDOWN) {
    syncAdapter?.sendTyping?.();
    lastTypingTime.current = now;
  }
}
```

### Phase 5c: Participant List Bar

Added below ActionBar in ChatApp.tsx:

```typescript
const selectedAgents = useMemo(() => {
  // ALL selected agents, even just 1
  return session.agentIds.map(id => agents.find(a => a.id === id)).filter(Boolean);
}, [session.agentIds, agents]);

const participants = useMemo(() => {
  // Only for group chat logic (2+ agents or remote users)
  const ids = session.agentIds;
  if (ids.length < 2 && session.remoteUsers.length === 0) return [];
  return ids.map(id => agents.find(a => a.id === id)).filter(Boolean);
}, [session.agentIds, session.remoteUsers, agents]);
```

The `selectedAgents` array ensures single agents appear in the participant bar,
while `participants` preserves the existing group chat logic (orchestrator only
activates with 2+ participants).

### Relay Bug Fix

**Problem:** `relay/server.js` broadcast() received Buffer objects from WebSocket messages, causing JSON parsing failures on clients.

**Root cause:** WebSocket `message` events emit `Buffer` objects when the message is binary or when the server doesn't specify encoding.

**Fix:** Convert Buffer to string before broadcasting:
```javascript
// Before (broken)
ws.on("message", (raw) => {
  broadcast(roomId, ws, raw); // raw is Buffer
});

// After (fixed)
ws.on("message", (raw) => {
  broadcast(roomId, ws, raw.toString()); // Convert Buffer → string
});
```

Applied in two places in `relay/server.js`:
1. Regular message handler
2. Echo filter (don't send back to sender)

### Post-Phase 5 Bug Fixes

**Bug 1: ActionBar badge shows "1" when no agents selected**

```typescript
// Before (buggy)
{participantCount && participantCount > 0 ? participantCount : 1}
// When participantCount = 0: 0 && ... → falsy → falls through to 1

// After (fixed)
{participantCount ?? 0}
// When participantCount = 0: 0 ?? 0 → 0
```

**Bug 2: Participant bar missing single agents**

```typescript
// Before: participants array requires 2+ agents
const participants = session.agentIds.length < 2 ? [] : ...;
// Single agent never shows in bar

// After: separate selectedAgents for display
const selectedAgents = session.agentIds.map(...); // ALL agents
const participants = session.agentIds.length < 2 ? [] : ...; // Group chat logic
```

## Migration from T40

T40 built:
- ✅ WebSocket relay
- ✅ Presence tracking (roster, join, leave)
- ✅ SyncAdapter interface
- ✅ WebSocketSyncAdapter

T43 delivered:
- ✅ Remote users as tab participants (not just connections)
- ✅ Participant selection through the existing agent and user controls
- ✅ Message routing to all participants
- ✅ AI context includes remote messages
- ✅ Human-only tabs (no agents)
- ✅ Message attribution (Phase 5a)
- ✅ Typing indicators (Phase 5b)
- ✅ Participant list bar (Phase 5c)
- ✅ Relay bug fix (Buffer→string)
- ✅ Post-phase bug fixes (badge, single agent display)

Delivery: All phases merged into `main`. Commits: `539ca52` through `ab23e5f`.

## Files

| File | Purpose |
|------|---------|
| `src/types.ts` | Extended ChatMessage, ChatSession |
| `src/hooks/useChatSession.ts` | Track remoteParticipants |
| `src/hooks/useMessageActions.ts` | Route to all, build AI context |
| `src/components/ChatApp.tsx` | Wire participant selection, typing state |
| `src/components/ActionBar.tsx` | User selection dropdown, badge fix |
| `src/components/ChatInput.tsx` | Throttled typing emitter |
| `src/components/ChatMessages.tsx` | Typing indicator UI |
| `src/components/MessageBubble.tsx` | Remote user attribution styling |
| `src/sync/SyncAdapter.ts` | Typing interface methods |
| `src/sync/WebSocketSyncAdapter.ts` | Set remote flag, typing implementation |
| `styles.css` | Participant bar, typing indicator, remote message styles |
| `relay/server.js` | Buffer→string fix in broadcast |

## References

- T40: Multi-User Chat with LaTeX Support (relay infrastructure)
- T43: Multi-User and Agent Chat (this task)
- `memory-bank/implementation-details/presence-tracking.md` (presence system)
- `memory-bank/implementation-details/multi-user-chat-design.md` (original T40 design)
