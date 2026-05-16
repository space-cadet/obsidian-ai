# Group Chat & Unified ChatApp Design
*Created: 2026-05-16 09:45:00 IST*
*Last Updated: 2026-05-16 09:45:00 IST*

## Overview

The obsidian-ai plugin supports **two chat modes** within the **same ChatApp panel**:

| Mode | Participants | Use Case |
|------|-------------|----------|
| **1:1 Chat** | 1 agent (active profile) | Standard Q&A, note editing, tool calling |
| **AI Council** | N agents (all configured profiles) | Multi-perspective analysis, research, brainstorming |

The user toggles between modes with a **👥 Council** button in the participant bar below the ActionBar.

---

## Architecture

### Component Hierarchy

```
ChatApp (src/components/ChatApp.tsx)
├── ActionBar (left/center/right layout)
├── ParticipantBar ← NEW
│   ├── Agent Chips (when council mode active)
│   │   ├── Icon + Name + Typing indicator
│   │   └── Remove button (×)
│   └── Council Toggle Button
│       ├── ON: "← Leave Council" (solid)
│       └── OFF: "👥 Council" (dashed)
├── ChatMessages
│   └── MessageBubble
│       ├── Agent Identity Dot (colored, when council mode)
│       └── Agent Name (when council mode)
├── ContextBar
├── ChatInput
└── Orchestrator (when council mode)
```

### State Machine

```
[1:1 Mode] ──click "👥 Council"──► [Council Mode]
    │                                │
    │                                ├── All profiles become participants
    │                                ├── handleSend branches to Orchestrator
    │                                └── Messages show agent identity
    │                                │
[1:1 Mode] ◄──click "← Leave"──────┘
    │
    └── Only active profile
    └── Normal handleSend flow
```

---

## Data Model

### Extended Types (src/types.ts)

```typescript
export interface ChatMessage {
  // ... existing fields ...
  agentId?: string;      // Which agent generated this message
  agentName?: string;    // Display name
  agentColor?: string;   // Hex color for identity dot
}

export interface GroupChatParticipant {
  id: string;           // Profile ID
  name: string;         // Display name
  profileId: string;    // Links to ProviderProfile
  color: string;        // Hex color
  icon?: string;        // Emoji or icon character
}

export interface ChatSession {
  // ... existing fields ...
  isGroupChat?: boolean;
  participants?: GroupChatParticipant[];
}
```

### Provider-to-Agent Mapping

| Provider | Color | Icon |
|----------|-------|------|
| gemini | #6366f1 (indigo) | 💎 |
| openai | #10b981 (emerald) | 🌐 |
| anthropic | #f43f5e (rose) | 🧠 |
| agent (remote) | #06b6d4 (cyan) | ☁️ |
| ollama | #f59e0b (amber) | 🔥 |
| default | #8b5cf6 (violet) | 🤖 |

Helper functions: `getAgentColor(provider: string): string`, `getAgentIcon(provider: string): string`

---

## Message Flow

### 1:1 Mode (Default)

```
User types → ChatInput.onSend()
                │
                ▼
         handleSend(text)
                │
                ├── NOT isGroupChat → 1:1 path
                │
                ▼
         Context resolution
                │
                ▼
         streamChat(messages, signal, resolvedProfile)
                │
                ▼
         Collect chunks → append to session.messages
```

### Council Mode

```
User types → ChatInput.onSend()
                │
                ▼
         handleSend(text)
                │
                ├── isGroupChat → council path
                │
                ▼
         orchestrator.parseAndRoute(text)
                │
                ├── No mentions → targets = ALL agents
                └── @Cloudy → targets = [Cloudy]
                │
                ▼
         setTypingAgents(target names)
                │
                ▼
         orchestrator.dispatch(text, thread)
                │
                ├── Sequential mode (default):
                │   ├── Send to Gemini → wait → AgentResponse
                │   ├── Send to Cloudy → wait → AgentResponse
                │   └── Send to Ember → wait → AgentResponse
                │
                └── Parallel mode (future):
                    ├── Send to Gemini ──┐
                    ├── Send to Cloudy ──┼── Promise.all
                    └── Send to Ember ───┘
                │
                ▼
         For each AgentResponse:
                ├── Create ChatMessage with agentId/agentName/agentColor
                ├── Append to session.messages
                └── Remove from typingAgents
```

---

## Orchestrator (src/agent/Orchestrator.ts)

### Responsibilities

1. **Parse mentions** from user input (`@AgentName`)
2. **Route messages** to target agents
3. **Build context** per agent (full transparency or isolated)
4. **Dispatch** sequentially or in parallel
5. **Yield responses** as they arrive

### Key Methods

```typescript
class Orchestrator {
  parseAndRoute(text: string): { targets: AgentEngine[], cleanText: string }
  // No mentions → all engines. Mentions → matched engines.

  buildContext(agentId: string, thread: ChatMessage[], cleanText: string): Message[]
  // Full: all messages with attribution. Isolated: only user + own responses.

  dispatch(text: string, thread: ChatMessage[]): AsyncGenerator<AgentResponse>
  // Sequential: yields one at a time. Parallel: yields as they complete.
}
```

### Context Strategies

| Strategy | What Agent Sees | Use Case |
|----------|----------------|----------|
| **Full Transparency** | All messages with `[AgentName]: content` attribution | Collaborative analysis |
| **Isolated** | Only user messages + own previous responses | Privacy-sensitive, independent tasks |

---

## Mention Parser (src/agent/MentionParser.ts)

### Regex

```typescript
const mentionRegex = /@([a-zA-Z0-9_-]+)/g
```

### Behavior

| Input | cleanText | mentions |
|-------|-----------|----------|
| `"How are you?"` | `"How are you?"` | `[]` |
| `"@Cloudy fetch arxiv"` | `"fetch arxiv"` | `['Cloudy']` |
| `"@Gemini analyze @Cloudy fetch"` | `"analyze fetch"` | `['Gemini', 'Cloudy']` |

### Routing Rules

1. **No mentions** → all agents respond
2. **Mentions present, all valid** → only mentioned agents respond
3. **Mentions present, some invalid** → mentioned + all agents (fallback)

---

## UI Components

### Participant Bar (styles.css)

```css
.chat-participant-bar {
  display: flex;
  gap: 6px;
  padding: 6px 12px;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
}
```

### Agent Chip

```css
.chat-participant-chip {
  display: inline-flex;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  font-size: 0.82em;
}
```

### Council Toggle Button

- **Inactive** (1:1 mode): Dashed border, muted text, "👥 Council" label
- **Active** (council mode): Not shown (replaced by agent chips + "← Leave Council")

### Typing Indicator

```css
.chat-participant-typing {
  animation: chat-typing-pulse 1.2s ease-in-out infinite;
}

@keyframes chat-typing-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
```

### Message Identity Badge

In `MessageBubble`:
- Left of timestamp: colored dot (8px circle, `agentColor`)
- Role label: "You" for user, `agentName` for assistant (e.g., "Cloudy")

---

## React State Flow

### ChatApp State (relevant to council mode)

```typescript
const [participants, setParticipants] = useState<GroupChatParticipant[]>([]);
const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
const isGroupChat = participants.length > 1;
```

### Orchestrator useMemo

```typescript
const orchestrator = useMemo(() => {
  if (!isGroupChat) return null;
  return new Orchestrator({
    api: plugin.chatapi,
    participants: resolvedEngines,
    mode: "sequential",
    contextStrategy: "full",
    enableTools: plugin.settings.enableAgentTools,
    autoApprove: plugin.settings.autoApply,
    maxSteps: plugin.settings.maxAgentSteps,
  });
}, [isGroupChat, participants, plugin.settings]);
```

### Critical: handleSend Dependencies

**MUST include:** `orchestrator`, `isGroupChat`, `participants`, `typingAgents`

```typescript
const handleSend = useCallback(async (text: string) => {
  // ...
}, [isStreaming, plugin, orchestrator, isGroupChat, participants, typingAgents]);
```

**Why:** Without these, handleSend captures a stale orchestrator closure. After removing a participant, the old orchestrator (with all engines) is still used.

---

## Known Limitations

1. **All-or-nothing toggle** — Cannot add individual profiles one-by-one (Phase 10)
2. **No tool calling in council mode** — Only `streamChat`, not `streamChatWithTools` (Phase 6)
3. **No parallel dispatch UI** — Sequential only, parallel exists in code (Phase 7)
4. **No mention autocomplete** — Must type `@AgentName` manually (Phase 11)
5. **No session persistence** — Council chats not saved to disk (Phase 9)
6. **Remove button UI-only** — Shows × but doesn't fully reconfigure mid-conversation

---

## Future Enhancements

### Phase 10: Individual Add/Remove
- Dropdown in participant bar to add specific profiles
- Remove participant → abort their pending responses

### Phase 11: Mention Autocomplete
- `@` triggers dropdown with available agents
- Tab/Enter to select, Escape to dismiss
- Filter as user types

### Phase 6: Tool Calling in Council
- Pending tool cards show agent attribution: "☁️ Cloudy wants to read Note.md"
- File-level locking: two agents can edit different files simultaneously
- Conflict resolution for same-file edits

### Phase 7: Parallel Mode Toggle
- Button to switch between sequential and parallel dispatch
- Parallel: all agents receive same prompt simultaneously
- Faster but agents can't reference each other

### Phase 9: Session Persistence
- Save council sessions to localStorage/data.json
- Session list shows council icon
- Restore on plugin reload

### Meta: Coordinator Agent
- A meta-LLM that decides which agent should respond based on query content
- Automatic routing without explicit mentions
- This is v2 architecture

---

## Related Files

| File | Purpose |
|------|---------|
| `src/agent/MentionParser.ts` | Parse @AgentName mentions |
| `src/agent/Orchestrator.ts` | Coordinate multi-agent dispatch |
| `src/components/ChatApp.tsx` | Unified chat: 1:1 + council modes |
| `src/components/MessageBubble.tsx` | Agent identity badges |
| `src/types.ts` | Agent identity fields, group chat types |
| `src/main.ts` | View registration, ribbon icon |
| `styles.css` | Participant bar, chips, typing, toggle |

---

## Design Decisions

1. **Unified UI over separate panels** — User explicitly requested. Same ChatApp handles both modes.
2. **All-or-nothing toggle as MVP** — Simplest implementation. Individual control is Phase 10.
3. **Sequential as default** — Agents can reference each other's responses. Parallel is opt-in.
4. **Full transparency as default context** — Agents see everything. Isolated mode configurable.
5. **No tool calling yet** — Requires attribution, locking, conflict resolution. Too complex for MVP.
6. **Stale orchestrator fix** — handleSend deps MUST include orchestrator. React useMemo alone insufficient.
7. **Participant bar below ActionBar** — Logical flow: actions → participants → messages → input.
8. **Dashed border for inactive toggle** — Visual affordance that council mode is available but not active.
