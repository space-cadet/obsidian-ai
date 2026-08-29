# Agentic Memory Architecture

**Status**: Design phase for tiered architecture; flat persistent store implemented
*Last Updated: 2026-08-29 21:26:31 IST*
**Related**: T46 (orchestration decomposition), T60a (capability registry)

## Problem

After weeks of usage, `memory.json` grows to ~250KB. Currently:
- ALL memory entries are loaded on every message
- Entries are truncated from the top (oldest first) to fit a hardcoded 2000-token budget
- `identityContextBudget` setting exists but is **dead code** — never passed to `loadFullContext()`
- Search uses naive `string.includes()` — no relevance ranking

## Proposed Architecture: Hot/Cold Tiers

Inspired by MemGPT/Letta but lightweight (pure JS, no model downloads):

### Core Memory (Hot) — `core.json`
- **Size**: ~50-100 entries, ~2-4K tokens
- **Always loaded** into system prompt
- **Auto-curated** by scoring function

### Archive Memory (Cold) — `archive.json`
- **Size**: Everything else
- **Search-only** via tool calls (`search_memories`)
- **Lossless** — all entries preserved

### Search Index — `index.json`
- TF-IDF index built at write time
- Enables relevance-ranked search
- Replaces naive `string.includes()`

## Scoring Function (Core Curation)

```
score = 0.4 × recency + 0.3 × importance + 0.3 × frequency
```

- **Recency**: Time since last access (exponential decay)
- **Importance**: User-assigned or LLM-inferred (1-5 scale)
- **Frequency**: How often entry is retrieved via search/tool

## Migration Path

1. **Phase 0**: Fix `identityContextBudget` bug (1 line)
2. **Phase 1**: Split `memory.json` → `core.json` + `archive.json`
3. **Phase 2**: Add TF-IDF `index.json`
4. **Phase 3**: Auto-curate `core.json` on writes
5. **Phase 4**: Add derived persona layer

## Files to Modify

| File | Change |
|------|--------|
| `src/intelligence/PersonaLoader.ts` | Accept `maxTokens` param, load only `core.json` |
| `src/intelligence/MemoryStore.ts` | Split storage, add TF-IDF, scoring |
| `src/lib/systemPrompt.ts` | Pass `identityContextBudget` setting |
| `src/agent/tools/handlers/memoryHandlers.ts` | Use TF-IDF for search |
| `src/settings.ts` | Ensure `identityContextBudget` is wired |

## Acceptance Criteria

- [ ] `identityContextBudget` setting actually controls memory context size
- [ ] Memory loads in <50ms for 250KB file
- [ ] Search returns ranked results (not just matches)
- [ ] No data loss during migration
- [ ] All existing tests pass

## Notes

- Browser-only: no Node fs. Use Obsidian `vault.adapter`.
- TF-IDF in pure JS: ~200 lines, no dependencies
- Index rebuild: async, triggered on write batch or manual

## Implementation Audit — 2026-08-29

The current source implements the flat `memory.json` store, generated
`memory.md`, audit log, CRUD/search tools, duplicate pruning, optional
end-of-session summarization, and explicit `search_past_sessions` through the
existing `SearchIndex`. It does not implement the hot/cold split, ranked
memory index, automatic core curation, or phrase-based automatic past-session
injection described above.

The `identityContextBudget` setting is present in settings and the UI but is
not passed by `buildSystemPrompt()` to `PersonaLoader.loadFullContext()`. The
loader consequently uses its 2,000-token default. This is the clearest small
wiring follow-up; the larger tiered design should remain deferred until the
flat store demonstrates a scale or relevance problem.
