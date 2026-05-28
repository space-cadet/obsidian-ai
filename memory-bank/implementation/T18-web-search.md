# T18: Web Search Tool — Implementation Doc
*Created: 2026-05-16 23:30 IST*
*Last Updated: 2026-05-17 11:01 IST*

---

## Overview

Add a `search_web` tool to the Obsidian AI plugin's agentic tool suite. This allows the LLM to search the web for current information when the user asks about recent events, news, or facts that may have changed since the model's training data.

Five search providers are supported, user-selectable in Settings:
- **DuckDuckGo** (default) — free, no API key, HTML scraping
- **Brave Search API** — requires API key, 2000 free queries/month, reliable JSON API
- **Tavily** — AI-optimized search, free tier, requires API key
- **Exa** — neural search, free tier, requires API key
- **SearXNG** — self-hosted, no API key, JSON API

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ChatApp.tsx   │────▶│  AgentLoop.ts   │────▶│  ToolExecutor   │
│  (system prompt │     │ (LLM decides    │     │  (execute tool) │
│   lists tools)  │     │  to call tool)  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          │
                              ┌───────────────────────────┼───────────┐
                              ▼                           ▼           ▼
                        ┌─────────┐                 ┌──────────┐ ┌──────────┐
                        │ DuckDuck│                 │  Brave   │ │ SearXNG  │
                        │  Go     │                 │  Search  │ │          │
                        │(scrape) │                 │  API     │ │(self-h)  │
                        └─────────┘                 └──────────┘ └──────────┘
```

## Files Changed

### `src/agent/tools.ts`

Added `searchWebTool` to the `noteTools` export:

```typescript
export const searchWebTool = t({
  description: "Search the web for current information...",
  inputSchema: z.object({
    query: z.string().describe("The search query string..."),
    limit: z.number().optional().default(5).describe("Max results..."),
  }),
});
```

Also added `search_web: searchWebTool` to the `noteTools` record.

### `src/agent/ToolExecutor.ts`

**Constructor change:** Now accepts optional `settings`:
```typescript
constructor(private app: App, private settings?: ObsidianAISettings) {}
```

**New methods:**

| Method | Purpose |
|--------|---------|
| `searchWeb(args)` | Router — picks provider from settings, formats results as markdown |
| `searchBrave(query, limit)` | Calls `api.search.brave.com/res/v1/web/search` with `X-Subscription-Token` header |
| `searchDuckDuckGo(query, limit)` | Fetches `html.duckduckgo.com/html/`, parses `.result` divs with regex, extracts title/URL/snippet |
| `searchTavily(query, limit)` | Calls `api.tavily.com/search` with `X-api-key` header, POST JSON |
| `searchExa(query, limit)` | Calls `api.exa.ai/search` with `x-api-key` header, POST JSON |
| `searchSearXNG(query, limit)` | Calls `{searxngUrl}/search?format=json`, maps `results` array |
| `stripHtml(html)` | Removes tags + decodes entities (`&amp;`, `&lt;`, etc.) |

**DuckDuckGo parsing details:**
- Primary regex matches `result__a` link + `result__snippet` anchor
- Extracts real URL from DuckDuckGo redirect via `uddg` query param
- Fallback regex for title/URL only if primary fails

**Result format returned to LLM:**
```markdown
1. **Title One**
   URL: https://example.com/one
   Snippet text here...

2. **Title Two**
   URL: https://example.com/two
   Snippet text here...
```

### `src/settings.ts`

**New types:**
```typescript
export type WebSearchProvider = "brave" | "duckduckgo" | "tavily" | "exa" | "searxng";
```

**New fields in `ObsidianAISettings`:**
- `webSearchProvider: WebSearchProvider` (default: `"duckduckgo"`)
- `braveApiKey: string` (default: `""`)
- `tavilyApiKey: string` (default: `""`)
- `exaApiKey: string` (default: `""`)
- `searxngUrl: string` (default: `""`)

**New settings section:** `renderWebSearch(containerEl)`
- Dropdown with 5 options (labeled with "free/requires key/self-hosted")
- Conditional API key fields (password input type) for Brave, Tavily, Exa
- Conditional URL field for SearXNG
- Added to `display()` method between Agent Tools and Advanced

### `src/components/ChatApp.tsx`

**System prompt update:** Added to `buildSystemPrompt()`:
```
- search_web: Search the web for current information. Use when the user asks 
  about recent events, news, or facts that may have changed since your training data.
```

**ToolExecutor wiring:** All 4 occurrences of `new ToolExecutor(plugin.app)` updated to `new ToolExecutor(plugin.app, plugin.settings)`:
1. Orchestrator constructor (group chat)
2. AgentLoop constructor (single-user tool path)
3. `handleApproveTool` callback (manual approval)
4. Inside `AgentLoop.run()` callback (auto-approve path)

## Provider Comparison

| Provider | Cost | Key Required | Reliability | Privacy | Best For |
|----------|------|-------------|-------------|---------|----------|
| DuckDuckGo | Free | No | Medium (scraping) | High | Default, casual use |
| Brave | 2000/mo free | Yes | High (JSON API) | Medium | Reliable results |
| Tavily | Free tier | Yes | High (AI-optimized) | Medium | LLM-optimized results |
| Exa | Free tier | Yes | High (neural) | Medium | Semantic/neural search |
| SearXNG | Free | No | High (self-hosted) | Very High | Privacy-focused users |

## Error Handling

- No results → `{ error: "No search results found." }`
- Brave API key missing → error tells user to add key in Settings
- SearXNG URL missing → error tells user to configure URL
- HTTP errors → status code + response text in error message
- DuckDuckGo parse failure → returns empty results (not an error)

## Testing Notes

- Build: `pnpm run build` ✅ passes
- DuckDuckGo scraping tested via curl; regex matches current HTML structure
- Brave API tested with valid key; returns structured JSON
- SearXNG requires a running instance for testing

## Future Improvements

- Add `search_news` variant for news-specific queries
- Add result caching to avoid repeated searches
- Add "search results too old" warning if all results are >1 year
- Consider adding `fetch_webpage` tool to read full article content

## Changelog

- **2026-05-16 23:28**: Initial implementation — 3 providers (DuckDuckGo, Brave, SearXNG)
- **2026-05-17 11:01**: Added Tavily + Exa providers (5 total)
