# Multi-User Chat Design Principles & Decisions

*Date: 2026-08-08*
*Status: IN PROGRESS — PoP Phase*
*Decision Owner: Deepak Vaid*

---

## Core Decision: No Supabase

**Decision:** Build WebSocket relay + WebRTC peer-to-peer. Reject cloud database (Supabase).

**Rationale:**
- Self-hosted = full control, no vendor lock-in
- Works on LAN without internet
- No account creation friction
- Aligns with Obsidian's local-first philosophy

---

## Architecture: Dual-Backend, Single Interface

```
┌─────────────────────────────────────────────┐
│           obsidian-ai Plugin                │
│                                             │
│  ┌──────────────┐    ┌──────────────────┐  │
│  │ GroupChatApp │◄──►│  SyncAdapter     │  │
│  │ (transport   │    │  (interface)      │  │
│  │  agnostic)   │    └────────┬─────────┘  │
│  └──────────────┘             │            │
│                               │            │
│              ┌────────────────┼────────┐   │
│              │                │        │   │
│         ┌────▼────┐    ┌─────▼─────┐   │   │
│         │ WebSocket│    │  WebRTC   │   │   │
│         │ Adapter  │    │  Adapter  │   │   │
│         └────┬────┘    └─────┬─────┘   │   │
│              │               │         │   │
│              ▼               ▼         │   │
│      ┌──────────────┐   ┌──────────┐  │   │
│      │ Relay Server │   │ STUN/TURN│  │   │
│      │ (ws://...)   │   │ (Google  │  │   │
│      └──────────────┘   │  default)│  │   │
│                         └──────────┘  │   │
└───────────────────────────────────────┘
```

---

## Design Principles

### 1. Transport Agnosticism
**Principle:** `GroupChatApp` knows NOTHING about WebSocket or WebRTC.

```typescript
// GroupChatApp only knows this interface
interface SyncAdapter {
  connect(roomId: string, userId: string): Promise<void>;
  disconnect(): void;
  sendMessage(msg: ChatMessage): Promise<void>;
  onMessage(callback: (msg: ChatMessage) => void): void;
}
```

**Consequence:** Adding a new backend (file-based, bluetooth, etc.) requires only implementing the interface.

---

### 2. LaTeX is Free
**Principle:** Don't build a LaTeX renderer. Obsidian already has MathJax/KaTeX.

**Evidence:** `MessageBubble.tsx` uses Obsidian's `MarkdownRenderer` which renders `$...$` and `$$...$$` natively.

**Decision:** Multi-user chat inherits LaTeX for free. No code needed.

---

### 3. Reuse, Don't Rebuild
**Principle:** Map human users to existing AI participant infrastructure.

| AI Concept | Human Equivalent | Status |
|-----------|-----------------|--------|
| `agentId` | `userId` | ✅ Field exists |
| `agentName` | `userName` | ✅ Field exists |
| `agentColor` | `userColor` | ✅ Field exists |
| `Participant[]` | Same structure | ✅ Type exists |
| Message bubble | Same rendering | ✅ Component exists |

**Decision:** Minimal UI changes. Just pass human data through existing fields.

---

### 4. Progressive Enhancement
**Principle:** Start with what works, add complexity only when needed.

| Phase | Transport | Features | Goal |
|-------|-----------|----------|------|
| PoP | WebSocket relay | Send/receive messages | Prove it works |
| v0.2 | WebSocket relay | Typing indicators, presence | Usable daily |
| v0.5 | WebRTC data channel | P2P messages | Lower latency |
| v1.0 | WebRTC + fallback | File transfer, voice | Production |

**Decision:** WebSocket first, WebRTC later. Don't block PoP on P2P complexity.

---

### 5. Room-Based, Not User-Based
**Principle:** Identity is tied to a room, not global auth.

```typescript
// Simple: join a room with any name
await syncAdapter.connect("room-123", "Alice");

// No accounts, no passwords, no OAuth
// If you know the room ID, you can join
```

**Decision:** Anonymous rooms for PoP. Add auth later if needed.

---

## Component Responsibilities

### WebSocket Relay Server (`relay/server.js`)
- **Single responsibility:** Forward messages between connected clients
- **Stateless:** No message history, no user database
- **Broadcast:** Message from any client → all other clients in same room

### WebSocketSyncAdapter (`src/sync/WebSocketSyncAdapter.ts`)
- **Single responsibility:** Bridge `SyncAdapter` interface to WebSocket
- **Lifecycle:** `connect()` opens WS, `disconnect()` closes
- **Message flow:** `sendMessage()` → WS send → relay → other clients → `onMessage()` callback

### WebRTCSyncAdapter (`src/sync/WebRTCSyncAdapter.ts`)
- **Single responsibility:** Bridge `SyncAdapter` interface to WebRTC data channel
- **Signaling:** Uses WebSocket relay only for initial handshake (offer/answer/ICE)
- **Data flow:** After handshake, messages go directly peer-to-peer

### GroupChatApp Modifications (`src/components/GroupChatApp.tsx`)
- **Add:** Optional `syncAdapter` prop
- **Add:** Distinguish local user from remote users
- **Reuse:** Existing message rendering, participant list, context system

---

## Data Flow: WebSocket PoP

```
Alice types: "Hi Bob! $E=mc^2$"
         │
         ▼
┌────────────────────┐
│ GroupChatApp       │  1. Add message to local state (shows immediately)
│ (Alice's Obsidian) │  2. Call syncAdapter.sendMessage(msg)
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ WebSocketSyncAdapter│ 3. Serialize → ws.send(JSON.stringify(msg))
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Relay Server       │ 4. Receive, broadcast to room "room-123"
│ (ws://localhost)   │    (all clients except sender)
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ WebSocketSyncAdapter│ 5. Receive via ws.onmessage
│ (Bob's Obsidian)   │ 6. Parse JSON → call onMessage callback
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ GroupChatApp       │ 7. Add message to state → React re-render
│ (Bob's Obsidian)   │ 8. MessageBubble renders with LaTeX
└────────────────────┘
```

---

## Error Handling Strategy

| Scenario | Behavior |
|----------|----------|
| Relay server down | Show "Reconnecting..." banner, queue messages, retry with backoff |
| WebRTC handshake fails | Fall back to WebSocket relay for messages |
| Message parse error | Log to console, skip message, continue |
| Duplicate message ID | Deduplicate by ID before adding to state |

---

## Security Considerations (Deferred)

**PoP:** No security. Anyone with room ID can join. Messages are plaintext.

**Future:**
- Room passwords
- End-to-end encryption (Signal Protocol or similar)
- TLS for WebSocket relay

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `relay/server.js` | Create | WebSocket relay server |
| `src/sync/SyncAdapter.ts` | Create | Interface definition |
| `src/sync/WebSocketSyncAdapter.ts` | Create | WebSocket implementation |
| `src/sync/WebRTCSyncAdapter.ts` | Create | WebRTC implementation (deferred) |
| `src/components/GroupChatApp.tsx` | Modify | Accept sync adapter, handle remote messages |
| `src/types.ts` | Modify | Add sync-related types |
| `src/settings.ts` | Modify | Add sync connection settings |

---

## Phase 1 Verification Log (2026-08-09)

### BRAT Beta Distribution
**Status:** ✅ Verified

- Plugin repo registered with BRAT successfully
- BRAT detects releases from `space-cadet/obsidian-ai`
- Install/update cycle works end-to-end
- No manual zip download needed

### Relay Server Connection
**Status:** ✅ Verified

- WebSocket adapter connects to `relay/server.js` without errors
- Room-based broadcast functioning
- Connection status indicator in GroupChatApp UI works

### Pending: Cross-Device Messaging
**Status:** ⬜ Not yet tested

- Need two separate Obsidian instances (or two devices) to verify message flow
- Planned for next session

---

## Next Steps

1. ✅ Write relay server (`relay/server.js`)
2. ✅ Write `SyncAdapter` interface
3. ✅ Write `WebSocketSyncAdapter`
4. ✅ Modify `GroupChatApp` for sync
5. 🔄 Test with two Obsidian instances
6. ⬜ Write `WebRTCSyncAdapter`
7. ⬜ Test WebRTC peer-to-peer

---

*Last Updated: 2026-08-08*
