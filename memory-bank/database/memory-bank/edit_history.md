# Edit History

*Last Updated: 2026-05-25 13:25:31 IST*

---

## 2026-05-25

#### 18:55:31 IST - T16: Fixed default profile selection and added thinking toggle to obsidian-ai plugin
- Modified `src/components/ChatApp.tsx` - Fixed handleNewChat() to fall back to active provider profile when selectedProfileIds is empty; added showThinking state
- Modified `src/components/ChatInput.tsx` - Added showThinking/onToggleThinking props and 💭 toggle button before send button
- Modified `src/components/ChatMessages.tsx` - Forwarded showThinking prop to MessageBubble
- Modified `src/components/MessageBubble.tsx` - Added showThinking prop; conditionally strips <thinking> tags only when showThinking=false

#### 13:35:38 IST - T16: Initialize DB-native memory bank workflow in obsidian-ai
- Created `memory-bank/database/schema.sql` - SQLite schema
- Created `memory-bank/database/lib/sqlite.js` - sql.js adapter
- Created `memory-bank/database/lib/inserts.js` - DB inserts
- Created `memory-bank/database/lib/regenerate.js` - Regeneration
- Created `memory-bank/database/lib/workflow.js` - Workflow API
- Created `memory-bank/database/package.json` - Package config
- Created `memory-bank/database/memory_bank.db` - SQLite DB

