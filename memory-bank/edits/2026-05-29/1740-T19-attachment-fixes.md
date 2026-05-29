# Edit Chunk — 2026-05-29 17:40 IST

## Session
- **Start**: 2026-05-29 17:07 IST
- **End**: 2026-05-29 17:43 IST
- **Trigger**: User request — attachment feature improvements
- **Duration**: ~36 minutes

## Actions

### 1. Fix Token Counting for Images/PDFs
- **Problem**: Message token estimates only counted text, ignoring images and PDFs
- **Root cause**: `estimateTokens()` was text-only; attachments resolved AFTER token computation
- **Fix**:
  - Added `estimateContentPartsTokens()` and `estimateContentPartTokens()` to `src/context/tokenEstimator.ts`
  - Image estimate: ~255 tokens (OpenAI convention)
  - PDF estimate: based on base64 byte size / 4
  - Moved `resolveAttachments()` BEFORE token computation in `useMessageActions.ts`
  - `useMessageActions.ts` now imports `estimateContentPartsTokens`
  - Removed duplicate `resolveAttachments()` call (was happening twice)
- **Commit**: `eab64d3` — included in "feat(T19): attachment improvements"

### 2. Expand PDF Support to All Providers
- **Problem**: PDFs only worked with Gemini; other providers got placeholder text
- **Discovery**: Vercel AI SDK v6 supports `FilePart` for OpenAI, Anthropic, and OpenRouter too
  - OpenAI: converts to `file` type with `file_data: data:application/pdf;base64,...`
  - Anthropic: converts to `document` type with `media_type: application/pdf`, adds `pdfs-2024-09-25` beta
  - OpenRouter: converts to `file` type with `file_data`
- **Fix**: Updated `AttachmentEngine.ts` — `resolveAttachment()` now sends `FilePart` for:
  - `gemini` ✅ (already worked)
  - `openai` ✅ (new)
  - `anthropic` ✅ (new)
  - `openrouter` ✅ (new)
  - DeepSeek/Kimi still get placeholder text (SDK doesn't support PDF for these)
- **Commit**: `eab64d3` — included in "feat(T19): attachment improvements"

### 3. External File Attachments (Outside Vault)
- **Problem**: Could only attach files already in the vault
- **Fix**:
  - Updated `Attachment` interface in `types.ts`:
    - Added `type: "file"` for generic external files
    - Added `data?: string` for inline base64 data
    - Added `mimeType?: string` for external files
  - Added `createExternalAttachment()` in `AttachmentEngine.ts`:
    - Reads `File` object via `arrayBuffer()`
    - Detects type from extension (image/pdf/text)
    - Stores base64 data inline
  - Updated `resolveAttachment()` to handle `data` field:
    - If `data` present, bypass vault read entirely
    - Images: direct base64 to `ImagePart`
    - PDFs: direct base64 to `FilePart` (for supported providers)
    - Text files: decode base64 to text
  - Updated `ChatInput.tsx`:
    - Added hidden `<input type="file">` element with `accept="image/*,.pdf,.txt,.md"`
    - Added "📁 Browse External File" option in dropdown (with divider)
    - Added `handleAttachExternal()` callback to trigger file picker
    - Added `handleFileInputChange()` and `handleFiles()` for processing selected files
    - Added drag-and-drop support: `onDragOver`, `onDragLeave`, `onDrop`
    - Added `isDragOver` state with visual feedback (`drag-over` CSS class)
  - Added CSS in `styles.css`:
    - `.chat-attach-dropdown-divider` for dropdown separator
    - `.chat-input-wrapper.drag-over` for drag-over visual feedback
- **Commit**: `eab64d3` — included in "feat(T19): attachment improvements"

## Verification
- Build: ✅ `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`
- Tests: ✅ 52 tests pass (useChatUI + useMessageActions)
- Push: ✅ `origin/main` updated

## Files Changed
| File | Change |
|------|--------|
| `src/context/tokenEstimator.ts` | Added `estimateContentPartTokens`, `estimateContentPartsTokens` |
| `src/hooks/useMessageActions.ts` | Resolve attachments before token estimate; import new functions |
| `src/context/AttachmentEngine.ts` | PDF for all providers; `createExternalAttachment`; inline data support |
| `src/types.ts` | `Attachment` interface: `type: "file"`, `data?`, `mimeType?` |
| `src/components/ChatInput.tsx` | File picker, drag-and-drop, external attachment handlers |
| `styles.css` | Dropdown divider, drag-over visual feedback |

## Next Steps
- Test with actual external files (drag-and-drop + file picker)
- Test PDFs with OpenAI/Anthropic providers
- Verify token estimates display correctly in MessageBubble
- Group chat attachment broadcasting (still deferred per user request)
