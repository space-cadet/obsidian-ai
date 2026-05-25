# Database-Native Memory Bank Workflow

Initialized from mb-core repo. Provides atomic DB operations + markdown regeneration.

## Files

- `schema.sql` — SQLite schema (edit_entries, file_modifications, task_items, sessions, etc.)
- `lib/sqlite.js` — sql.js adapter (WASM SQLite, in-memory with disk persistence)
- `lib/inserts.js` — DB insert operations
- `lib/regenerate.js` — Markdown file generation from DB state
- `lib/workflow.js` — High-level API: `recordSessionWork()`, `completeSessionWork()`
- `memory_bank.db` — Initialized SQLite database

## Usage

```javascript
import { recordSessionWork } from './lib/workflow.js';

const result = await recordSessionWork({
  task_id: 'T16',
  task_description: 'Fixed bug in profile card',
  files_modified: [
    { action: 'Modified', path: 'src/components/ProfileCard.tsx', description: 'Fixed duplicate ID bug' }
  ],
  task_status: 'in_progress',
  session_period: 'afternoon',
  regenerate_markdown: true  // Optional: regenerates edit_history.md, tasks.md, etc.
});
```

## Tables

| Table | Purpose |
|-------|---------|
| `edit_entries` | Work session records |
| `file_modifications` | Files changed per session |
| `task_items` | Task registry |
| `task_dependencies` | Task dependency graph |
| `sessions` | Session records |
| `session_cache` | Current session snapshot |
| `transaction_log` | Audit trail |
| `error_logs` | Error tracking |

## DB-Native vs Text-Based

The DB workflow automates the chronological layer (edit_history, tasks, sessions).
The knowledge layer (implementation docs, tech context, product context) must still be maintained manually.
