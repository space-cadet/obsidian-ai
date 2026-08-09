# Multi-User Chat Architecture Audit

*Date: 2026-08-08*
*Auditor: Sage (灵剑)*
*Scope: obsidian-ai chat system — assessing feasibility of adding multi-user sync*

---

## Executive Summary

**Finding:** obsidian-ai has a solid foundation for adding multi-user chat. The LaTeX rendering, message types, and UI components already exist. What's missing is a **sync layer** to bridge multiple Obsidian instances.

**Key Insight:** The existing "Group Chat" (AI Council) already demonstrates multi-participant messaging. We can repurpose this pattern for human users with minimal UI changes.

---

## Current Architecture

### 1. Data Model

**Core types** (`src/types.ts`):

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  // ... metadata fields
  agentId?: string;      // For AI participants
  agentName?: string;    // Display name
  agentColor?: string;   // UI color
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  contextItems: ContextItem[];
  isGroupChat?: boolean;
  participants?: GroupChatParticipant[];
  // ...
}

interface GroupChatParticipant {
  id: string;
  name: string;
  profileId: string;
  color: string;
  icon?: string;
}
```

**Assessment:** ✅ Types already support multi-participant. `agentId`, `agentName`, `agentColor` fields are already used for AI participants — these map naturally to `userId`, `userName`, `userColor` for humans.

---

### 2. Storage Layer

**ChatStorage** (`src/storage/ChatStorage.ts`):

Two storage backends:
- **LegacyStorage**: Single `data.json` file (current default)
- **JsonlStorage**: Split architecture with index + per-session `.jsonl` files

Both are **file-based, local-only**. No network sync capability.

**Key finding:** Storage interface is simple:
```typescript
interface ChatStorage {
  loadChatData(): Promise<StoredChatData>;
  saveChatData(data: StoredChatData): Promise<void>;
  detectLegacyFormat(): Promise<boolean>;
}
```

**Assessment:** ✅ Clean interface — easy to add a `SyncedStorage` wrapper that delegates to both local file storage AND a remote sync backend.

---

### 3. UI Components

**GroupChatApp** (`src/components/GroupChatApp.tsx`):

- React component managing local state with `useState<ChatSession>`
- `handleSend` — adds user message, then dispatches to AI agents via Orchestrator
- Messages rendered via `MessageBubble` with `agentName`/`agentColor` display
- Participants shown with colored pills

**Key finding:** UI already renders multi-participant conversations. Agent messages show:
- Colored name pill
- Avatar icon
- Attribution

**Assessment:** ✅ UI already supports multi-user display. Minimal changes needed.

---

### 4. AI Orchestration

**Orchestrator** (`src/agent/Orchestrator.ts`):

- Parses `@mentions` to route to specific agents
- Supports sequential or parallel dispatch
- Each agent gets a `ProviderProfile` (API key, model, etc.)
- Debate mode for multi-round discussions

**Key finding:** `parseAndRoute` already handles mention-based routing:
```typescript
parseAndRoute(text: string): { targets: AgentEngine[]; cleanText: string }
```

**Assessment:** ⚠️ Orchestrator is AI-specific. For human users, we'd need a different routing/dispatch mechanism, but the mention parsing is reusable.

---

### 5. Message Rendering

**MessageBubble** (`src/components/MessageBubble.tsx`):

- Uses Obsidian's `MarkdownRenderer` for rich text
- Already supports math via Obsidian's built-in MathJax/KaTeX
- Highlights context mentions
- Intercepts internal Obsidian links

**Assessment:** ✅ LaTeX already works! Obsidian's built-in math rendering handles `$...$` and `$$...$$`.

---

### 6. Context System

**ContextEngine** (`src/context/ContextEngine.ts`):

- `@note` mentions inject note content into chat
- `@folder`, `@tag`, `@active-note` also supported
- Context items stored per-session

**Assessment:** ✅ Powerful context system already exists. Multi-user chats would benefit from shared context visibility.

---

## Gaps for Multi-User

| Gap | Current State | Needed |
|-----|--------------|--------|
| **Sync** | File-only local storage | Real-time sync adapter |
| **Identity** | AI agent profiles | Human user identities |
| **Auth** | None (single-user) | Room-based or user auth |
| **Presence** | None | Typing indicators, online status |
| **Conflict** | N/A (single writer) | Last-write-wins or CRDT |
| **Offline** | Always works | Queue + replay on reconnect |

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    obsidian-ai Plugin                        │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  ChatApp     │    │ GroupChatApp │    │   Views      │  │
│  │ (1:1 AI)     │    │ (multi-user) │    │              │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┘  │
│         │                   │                               │
│  ┌──────▼───────┐    ┌──────▼───────┐                      │
│  │ ChatStorage  │◄──►│ SyncAdapter  │                      │
│  │ (local JSONL)│    │ (Supabase)   │                      │
│  └──────────────┘    └──────┬───────┘                      │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │ WebSocket / Realtime
                              ▼
                    ┌──────────────────┐
                    │  Supabase        │
                    │  - rooms table   │
                    │  - messages table│
                    │  - presence table│
                    └──────────────────┘
```

---

## Recommended Sync Adapter Interface

```typescript
interface SyncAdapter {
  connect(roomId: string, userId: string): Promise<void>;
  disconnect(): void;
  
  // Incoming events
  onMessage(callback: (msg: ChatMessage) => void): void;
  onPresence(callback: (users: UserPresence[]) => void): void;
  onTyping(callback: (userId: string, isTyping: boolean) => void): void;
  
  // Outgoing actions
  sendMessage(msg: ChatMessage): Promise<void>;
  setTyping(isTyping: boolean): void;
  setPresence(status: "online" | "away" | "offline"): void;
}
```

---

## Database Schema (Supabase)

```sql
-- Rooms
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  settings JSONB DEFAULT '{}'
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_color TEXT,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  context_items JSONB DEFAULT '[]'
);

-- Presence
CREATE TABLE presence (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  status TEXT DEFAULT 'online',
  last_seen TIMESTAMPTZ DEFAULT now(),
  is_typing BOOLEAN DEFAULT false,
  PRIMARY KEY (room_id, user_id)
);

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE presence;
```

---

## Implementation Path

### Phase 1: Minimal Viable Sync (2-3 weeks)
1. Create `SupabaseSyncAdapter` implementing `SyncAdapter`
2. Modify `GroupChatApp` to accept a sync adapter
3. Add UI for "Join Room" / "Create Room"
4. Messages sync in real-time between users

### Phase 2: Rich Features (1-2 weeks)
5. Typing indicators via presence table
6. `@user` mentions alongside `@note` mentions
7. Message reactions

### Phase 3: Polish (1 week)
8. Offline queue + replay
9. Conflict resolution (last-write-wins sufficient for MVP)
10. Room settings (persistent, private, etc.)

---

## Open Questions

1. **Auth model:** Anonymous rooms (just enter name) or require Supabase auth?
2. **AI integration:** Should AI agents still participate in human rooms? ("@sage what do you think?")
3. **Context sharing:** Should all users see the same `@note` context, or per-user?
4. **History:** Load full history on join, or paginate?

---

## Conclusion

**obsidian-ai is well-positioned for multi-user chat.** The existing:
- ✅ LaTeX rendering (via Obsidian's MathJax)
- ✅ Multi-participant message types
- ✅ Group chat UI
- ✅ Clean storage interface
- ✅ Context/mention system

All reduce the scope significantly. The main work is:
1. **Supabase sync adapter** (~40% of effort)
2. **UI modifications** for room management (~30%)
3. **Integration testing** across multiple Obsidian instances (~30%)

**Estimated timeline:** 4-6 weeks for a solid MVP.

---

## Related Files

| File | Purpose |
|------|---------|
| `src/storage/ChatStorage.ts` | Local persistence |
| `src/components/GroupChatApp.tsx` | Multi-participant UI |
| `src/agent/Orchestrator.ts` | AI coordination |
| `src/components/MessageBubble.tsx` | Message rendering |
| `src/types.ts` | Core data types |
| `src/context/ContextEngine.ts` | @mention context |

---

*Audit complete. Ready for schema design and implementation.*
