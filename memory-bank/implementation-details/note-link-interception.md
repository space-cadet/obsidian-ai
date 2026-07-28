# Fix: Obsidian Note Link Click Crash (T28)

**Status:** ✅ COMPLETED  
**Date:** 2026-07-28  
**Related Tasks:** T28  

## Problem

When the agent returned messages containing Obsidian wiki-links (`[[Note Name]]`), clicking them crashed the entire Obsidian app instead of opening the note.

## Root Cause

`MarkdownRenderer.render()` converts wiki-links to HTML `<a>` tags. In the chat panel (a React component, not a native MarkdownView), Obsidian's default link handler couldn't resolve the click context and crashed.

## Solution

Added `setupLinkInterception()` function in `src/components/MessageBubble.tsx` that:

1. Intercepts all click events on `<a>` tags within rendered message content
2. Routes internal links through `app.workspace.openLinkText()`
3. Opens external URLs (`http://`, `https://`) in browser
4. Catches errors to prevent crashes

## Code Changes

### `src/components/MessageBubble.tsx`

Added `setupLinkInterception(container, app)`:

```typescript
function setupLinkInterception(container: HTMLElement, app: App): void {
    const links = container.querySelectorAll("a");
    for (const link of links) {
        const newLink = link.cloneNode(true) as HTMLElement;
        link.parentNode?.replaceChild(newLink, link);

        newLink.addEventListener("click", (e: Event) => {
            e.preventDefault();
            e.stopPropagation();

            const anchor = e.currentTarget as HTMLAnchorElement;
            const href = anchor.getAttribute("href") || "";

            // Internal Obsidian wiki-link
            if (href.startsWith("[[") || href.endsWith(".md") || anchor.classList.contains("internal-link")) {
                const cleanHref = href.replace(/^\[\[/, "").replace(/\]\]$/, "");
                app.workspace.openLinkText(cleanHref, "", false);
                return;
            }

            // obsidian:// protocol
            if (href.startsWith("obsidian://")) {
                window.open(href, "_blank");
                return;
            }

            // External link
            if (href.startsWith("http://") || href.startsWith("https://")) {
                window.open(href, "_blank");
                return;
            }

            // Fallback: treat as internal
            app.workspace.openLinkText(href, "", false);
        });
    }
}
```

Applied in:
- `TextSegment` useEffect after MarkdownRenderer.render()
- `StreamingBubble` useEffect after MarkdownRenderer.render()

## Testing Notes

- Test with `[[Note Name]]` format
- Test with `[[Note|Alias]]` format
- Test with external URLs
- Verify no crashes from any link interaction

## Files Modified

- `src/components/MessageBubble.tsx`
