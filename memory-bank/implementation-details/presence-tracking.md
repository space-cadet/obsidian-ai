# Presence Tracking Design

*Created: 2026-08-09*
*Updated: 2026-08-10*
*Applies to: T40 Phase 2*

## Screenshot
![Remote User Dropdown](assets/t40-remote-user-dropdown.jpg)
*Remote user dropdown showing connected users with room header and connection status*

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
- Icon: `radio` (📻) when relay connected, `globe` (🌐) when disconnected
- Badge: always shows count (0, 1, 2, ...)
- Active state: `is-active` class when connected

### Remote User Dropdown
- Triggered by clicking the 📻 radio icon
- Header: shows room name + connection status (green dot)
- User list: each user with green dot, "You" badge for self
- Empty state: "No users connected"
- CSS: `.chat-remote-user-dropdown` with theme variables

### ChatApp Wiring (Critical: Register Callbacks Before Connect)
```typescript
// CORRECT ORDER — register callbacks BEFORE connect()
adapter.onUserList((users) => setConnectedUsers(users));
adapter.onPresence((event) => {
  if (event.type === "join") addUser(event.userId);
  if (event.type === "leave") removeUser(event.userId);
});
adapter.onMessage((remoteMsg) => {
  // append to session messages
});
adapter.connect(roomId, userId);  // ← must be LAST
```

## Bug Fixes (2026-08-10)

### Bug 1: `remoteUserCount` Never Passed
- **Symptom:** Badge always showed 0, `is-active` never applied
- **Root cause:** ChatApp.tsx passed `connectedUsers` array but not `remoteUserCount` prop
- **Fix:** Added `remoteUserCount={connectedUsers.length}` to ActionBar

### Bug 2: Badge Hidden When Count ≤ 0
- **Symptom:** Couldn't see count when alone in room
- **Root cause:** Badge condition was `(remoteUserCount ?? 0) > 0`
- **Fix:** Always render badge; use `is-active` class for visual state

### Bug 3: Race Condition in Callback Registration
- **Symptom:** First client to join got empty roster
- **Root cause:** `connect()` called before `onUserList()` registered; server sends roster immediately upon WebSocket open
- **Fix:** Reordered code — register all callbacks before `connect()`

### Bug 4: Relay Roster Excluded Self
- **Symptom:** Users never saw themselves in the list
- **Root cause:** Server added client to room AFTER computing roster
- **Fix:** Add client to room BEFORE sending roster; include self in user list

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
| `styles.css` | Dropdown styling |
