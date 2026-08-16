# PDF Text Extraction
*Created: 2026-08-16 19:05 IST*

## Overview

The `read_pdf` agent tool extracts text from PDF documents and presents it to the LLM as markdown-formatted content. It supports both online PDFs (via URL) and vault PDF files (via path), with dual extraction backends.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User Request  │────▶│  readPdfTool     │────▶│  PdfExtractor   │
│  "read this PDF"│     │  (agent tool)    │     │  (dual backend) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                               ┌──────────────────────────┼──────────────────────────┐
                               │                          │                          │
                               ▼                          ▼                          ▼
                    ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
                    │  Server Mode    │        │   Client Mode   │        │    Auto Mode    │
                    │  (PyMuPDF)      │        │  (pdfjs-dist)   │        │  Server → Client│
                    │                 │        │                 │        │  fallback       │
                    │  POST to        │        │  Load PDF in    │        │                 │
                    │  /relay/pdf-ex/ │        │  Obsidian       │        │                 │
                    │  extract/       │        │  Electron       │        │                 │
                    └─────────────────┘        └─────────────────┘        └─────────────────┘
```

## Server-side Extraction Service

### Deployment

- **Host**: `quantumofgravity.com` (VPS)
- **Internal port**: 8082
- **Public path**: `https://quantumofgravity.com/relay/pdf-extract/`
- **Proxy**: Apache `ProxyPass /relay/pdf-extract/ http://127.0.0.1:8082/`
- **Process**: systemd `pdf-extract.service` (auto-restart on failure)

### Implementation

```python
# pdf_extract_service.py — Flask + PyMuPDF
@app.route("/extract", methods=["POST"])
def extract():
    body = request.get_json()
    url = body.get("url")          # or base64 "data"
    max_pages = body.get("max_pages")

    pdf_bytes = fetch_from_url(url) if url else base64_decode(body["data"])
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page in doc:
        text = page.get_text()
        # returns structured JSON with metadata, per-page text, word counts
```

### Why PyMuPDF on the server

- **Speed**: C++ backend, ~10x faster than pdfjs-dist for text extraction
- **Quality**: Better text layout preservation, handles scanned PDFs with OCR layer
- **Size**: No bundle impact — lives on server, not in plugin
- **Extensible**: Can add table extraction (pdfplumber), image extraction, metadata

### Security

- Service binds to `127.0.0.1:8082` only (not exposed directly)
- Apache handles TLS termination
- No authentication on endpoint (public service for plugin users)
- User can self-host by changing the server URL in settings

## Client-side Extraction (pdfjs-dist)

### Why pdfjs-dist

- **Offline**: Works without internet (vault PDFs, local files)
- **Privacy**: PDF never leaves the user's machine
- **Obsidian-compatible**: Runs in Electron renderer process

### Bundle Impact

```
pdfjs-dist@4.10.38: ~2.5MB unzipped
Actual impact: ~800KB gzipped (tree-shaken, text extraction only)
```

### Worker-less Mode

Text extraction uses `pdfjs.getDocument({ data: arrayBuffer })` without spawning a Web Worker (avoids worker script path issues in Electron).

## Plugin Integration

### Tool Definition

```typescript
export const readPdfTool = t({
    description: "Read and extract text from a PDF file...",
    inputSchema: z.object({
        source: z.string().describe("PDF URL or vault file path"),
        max_pages: z.number().optional().default(50),
    }),
});
```

### Tool Executor

```typescript
private async readPdf(args: { source: string; max_pages?: number }) {
    const { extractPdfFromUrl, extractPdfFromBuffer } = await import("../utils/PdfExtractor");

    if (source.startsWith("http")) {
        result = await extractPdfFromUrl(source, { method, serverUrl, maxPages });
    } else {
        // Vault file
        const file = this.app.vault.getAbstractFileByPath(source);
        const buffer = await this.app.vault.readBinary(file);
        result = await extractPdfFromBuffer(buffer, { maxPages });
    }

    // Format as markdown for LLM
    return { content: header + body };
}
```

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `pdfExtractionMethod` | `"auto"` | `"auto"` \| `"server"` \| `"client"` |
| `pdfExtractionServerUrl` | `quantumofgravity.com/relay/pdf-extract/` | Server endpoint |
| `pdfMaxPages` | `50` | Max pages to extract (0 = no limit) |

### UI: PDF Attachment Cards

In `MessageBubble.tsx`, PDF attachments render as interactive cards:

```typescript
function PdfAttachmentCard({ attachment, app }) {
    // 💾 Save — decodes base64, writes to vault via app.vault.createBinary()
    // 🔗 Open — window.open(attachment.path, "_blank")
}
```

## Data Flow

### Online PDF (URL)

```
User pastes URL ──▶ readPdfTool ──▶ extractPdfFromUrl()
    │                                    │
    │    ┌───────────────────────────────┘
    │    │
    │    ▼ (auto mode)
    │  POST to server endpoint
    │  { url: "...", max_pages: 50 }
    │    │
    │    ▼
    │  Server fetches PDF, extracts with PyMuPDF
    │  Returns JSON: { pages: [...], full_text: "...", metadata: {...} }
    │    │
    └──◄─┘
       ToolExecutor formats as markdown
       LLM receives structured text content
```

### Vault PDF (file path)

```
User attaches PDF ──▶ readPdfTool ──▶ extractPdfFromBuffer()
    │                                      │
    │    ┌─────────────────────────────────┘
    │    │
    │    ▼
    │  app.vault.readBinary(file) → ArrayBuffer
    │  pdfjs.getDocument({ data: arrayBuffer })
    │  page.getTextContent() for each page
    │    │
    └──◄─┘
       ToolExecutor formats as markdown
```

## Error Handling

| Error | Cause | Fallback |
|-------|-------|----------|
| Server fetch fails (timeout, 5xx) | Network/server issue | Auto mode → client-side extraction |
| Server returns error | Invalid PDF, blocked URL | Returns error to LLM |
| Client extraction fails | Corrupt PDF, encrypted | Returns error to LLM |
| Base64 decode fails | Invalid data | Returns error to LLM |

## Testing

- **Server endpoint**: Tested with arXiv PDF URL
  - Result: 2 pages, 1202 words extracted in ~1s
- **Client-side**: Not yet tested with real vault PDFs
- **Provider compatibility**: Not yet tested across all providers (Gemini, OpenAI, Anthropic, DeepSeek, Kimi)

## Future Enhancements

1. **Table extraction**: Add pdfplumber server-side for structured table data
2. **Image extraction**: Extract figures/diagrams from PDFs as image parts
3. **Password-protected PDFs**: Prompt for password, pass to extraction backend
4. **Lighter client library**: Evaluate `@extractus/pdf-extractor` or tree-shaken pdfjs-dist builds
5. **Caching**: Cache extracted text by PDF hash to avoid re-extraction
6. **Chunking**: For large PDFs, return only relevant sections based on user query
