# Multi-User and Agent Chat Architecture

*Created: 2026-08-10*
*Status: Architecture Design*
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
- **Remote user messages**: New styling (different color, "👤 Alice" label)
- **Local user messages**: Existing styling ("You" label)

### Presence Indicator

- Radio icon (📻) shows connected users from relay
- Click to see who's online
- Online users can be added to tab via dropdown

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

Implementation status: relay-only dispatch is implemented in `ParticipantRouter`.
When a tab has selected remote users but no AI profiles, the router sends the
message through the active `SyncAdapter` and skips the AI orchestrator. Visual
attribution, typing indicators, and the participant header remain deferred to
Phase 5.

## Migration from T40

T40 built:
- ✅ WebSocket relay
- ✅ Presence tracking (roster, join, leave)
- ✅ SyncAdapter interface
- ✅ WebSocketSyncAdapter

T43 adds:
- 🔄 Remote users as tab participants (not just connections)
- 🔄 Participant selection UI (agent + user dropdowns)
- 🔄 Message routing to all participants
- 🔄 AI context includes remote messages
- 🔄 Human-only tabs (no agents)

## Files

| File | Purpose |
|------|---------|
| `src/types.ts` | Extended ChatMessage, ChatSession |
| `src/hooks/useChatSession.ts` | Track remoteParticipants |
| `src/hooks/useMessageActions.ts` | Route to all, build AI context |
| `src/components/ChatApp.tsx` | Wire participant selection |
| `src/components/ActionBar.tsx` | User selection dropdown |
| `src/sync/WebSocketSyncAdapter.ts` | Set remote flag |

## References

- T40: Multi-User Chat with LaTeX Support (relay infrastructure)
- `memory-bank/implementation-details/presence-tracking.md` (presence system)
- `memory-bank/implementation-details/multi-user-chat-design.md` (original T40 design)
