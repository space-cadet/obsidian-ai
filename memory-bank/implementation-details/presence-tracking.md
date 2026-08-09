# Presence Tracking Design

*Created: 2026-08-09*
*Applies to: T40 Phase 2*

## Overview

Real-time user presence for multi-user chat rooms. Shows who's currently connected to the same relay room.

## Architecture

```
┌─────────────────┐     join/leave/roster      ┌──────────────┐
│  Relay Server   │◄──────────────────────────►│ WS Adapter   │
│  (room state)   │     WebSocket messages      │ (per client) │
└─────────────────┘                             └──────┬───────┘
                                                       │
                              onUserList(users)        │
                              onPresence({type, userId})│
                                                       ▼
                                               ┌──────────────┐
                                               │   ChatApp    │
                                               │  (React UI)  │
                                               └──────────────┘
```

## Relay Protocol

### Connection
```
ws://host:port/ws/:roomId?userId=Alice
```

### Messages

**Server → Client:**
```json
{"type": "roster", "users": ["Alice", "Bob"]}
{"type": "join", "userId": "Charlie"}
{"type": "leave", "userId": "Bob"}
```

**Client → Server:**
```json
{"type": "chat", ...}   // regular chat message (unchanged)
```

### Server Behavior

1. **On connect:** Parse `userId` from query param. Add to room. Send roster to new client. Broadcast `join` to others.
2. **On disconnect:** Remove from room. Broadcast `leave` to others.
3. **On message:** If `chat` type, broadcast to all other clients in room.

## SyncAdapter Interface (v2)

```typescript
interface SyncAdapter {
  connect(roomId: string, userId: string): Promise<void>;
  disconnect(): void;
  sendMessage(msg: ChatMessage): Promise<void>;
  onMessage(callback: (msg: ChatMessage) => void): void;
  onUserList(callback: (users: string[]) => void): void;      // NEW
  onPresence(callback: (event: PresenceEvent) => void): void; // NEW
}

type PresenceEvent = { type: "join" | "leave"; userId: string };
```

## WebSocketSyncAdapter Implementation

- **Echo filtering:** Ignores messages from self (`agentId !== this.userId`)
- **Presence handling:** Routes `roster`/`join`/`leave` to registered callbacks
- **Reconnection:** Preserves all callbacks across reconnect

## UI Integration

### State
- `connectedUsers: string[]` — live list from relay
- `showRemoteUserDropdown: boolean` — toggle visibility

### ActionBar
- Second dropdown adjacent to AI model dropdown
- Icon: `users` (Lucide icon)
- Shows: connected users with "You (Alice)" highlighted
- No checkboxes — informational only

### ChatApp Wiring
```typescript
adapter.onUserList((users) => setConnectedUsers(users));
adapter.onPresence((event) => {
  if (event.type === "join") addUser(event.userId);
  if (event.type === "leave") removeUser(event.userId);
});
```

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Same userId from two tabs | Both appear in roster (by design — tab count visible) |
| Reconnect | Server sends fresh roster; client drops stale list first |
| Relay down | Dropdown shows empty; reconnect restores list |
| User leaves | `leave` event removes from list immediately |

## Security Notes

- No auth on userId — clients can spoof. Acceptable for LAN/PoP.
- No rate limiting on join/leave. Small rooms only.
- Future: Add HMAC-signed userIds or token-based auth.

## Files

| File | Purpose |
|------|---------|
| `relay/server.js` | Room state + presence broadcast |
| `src/sync/SyncAdapter.ts` | Interface definition |
| `src/sync/WebSocketSyncAdapter.ts` | WS implementation |
| `src/hooks/useChatUI.ts` | UI state for connected users |
| `src/components/ActionBar.tsx` | Remote user dropdown |
| `src/components/ChatApp.tsx` | Presence callback wiring |
