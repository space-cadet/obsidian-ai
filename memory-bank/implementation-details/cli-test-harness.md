# T21: CLI Test Harness — Implementation Doc
*Created: 2026-05-25 22:50 IST*
*Last Updated: 2026-05-25 22:50 IST*

---

## Overview

Standalone CLI test scripts for obsidian-ai plugin AI features. Runs without Obsidian runtime using Node.js + mock vault. Enables testing attachment resolution, streaming, tool calling, and multimodal APIs with real provider keys.

## Architecture

```
scripts/test-*.ts
    │
    ├──▶ mockApp (fs-based vault mock)
    │
    ├──▶ AttachmentEngine.resolveAttachments()
    │
    ├──▶ ChatApiManager.streamChat() / streamChatWithTools()
    │
    └──▶ Provider API (Gemini, OpenAI, etc.)
```

## Files

| File | Purpose |
|------|---------|
| `scripts/test-attachments.ts` | Resolve vault files → content parts, print JSON |
| `scripts/test-stream-chat.ts` | Simple prompt → stream response to stdout |
| `scripts/test-tool-calling.ts` | Tool call → execute → show result |
| `scripts/test-multimodal.ts` | Image attachment → vision model → describe |
| `scripts/test-pdf.ts` | PDF attachment → Gemini FilePart → summarize |
| `scripts/lib/mockApp.ts` | Minimal Obsidian `App` mock for Node.js |
| `scripts/lib/loadSettings.ts` | Load API keys from `.env` or env vars |

## Mock App (`scripts/lib/mockApp.ts`)

```typescript
import * as fs from "fs";
import * as path from "path";

export function createMockApp(vaultRoot: string) {
  return {
    vault: {
      getAbstractFileByPath: (filePath: string) => {
        const fullPath = path.join(vaultRoot, filePath);
        if (!fs.existsSync(fullPath)) return null;
        return {
          path: filePath,
          extension: path.extname(filePath).slice(1),
          stat: fs.statSync(fullPath),
        };
      },
      read: async (file: any) => fs.promises.readFile(path.join(vaultRoot, file.path), "utf-8"),
      readBinary: async (file: any) => {
        const buf = fs.promises.readFile(path.join(vaultRoot, file.path));
        return (await buf).buffer.slice((await buf).byteOffset, (await buf).byteOffset + (await buf).byteLength);
      },
    },
  } as any;
}
```

## Settings Loader (`scripts/lib/loadSettings.ts`)

```typescript
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ObsidianAISettings } from "../src/settings";

export function loadSettings(): Partial<ObsidianAISettings> {
  // Try .env in repo root
  dotenv.config();

  // Try ~/.obsidian-ai-test-keys.json
  const homeKeys = path.join(process.env.HOME || "", ".obsidian-ai-test-keys.json");
  let fileKeys: Record<string, string> = {};
  if (fs.existsSync(homeKeys)) {
    fileKeys = JSON.parse(fs.readFileSync(homeKeys, "utf-8"));
  }

  return {
    providerProfiles: [
      {
        id: "gemini-test",
        name: "Gemini Test",
        provider: "gemini",
        model: "gemini-2.5-flash-preview-05-20",
        apiKey: process.env.GEMINI_API_KEY || fileKeys.GEMINI_API_KEY || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "openai-test",
        name: "OpenAI Test",
        provider: "openai",
        model: "gpt-4o",
        apiKey: process.env.OPENAI_API_KEY || fileKeys.OPENAI_API_KEY || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "anthropic-test",
        name: "Anthropic Test",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        apiKey: process.env.ANTHROPIC_API_KEY || fileKeys.ANTHROPIC_API_KEY || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    activeProfileId: "gemini-test",
    enableAgentTools: false,
    autoApply: true,
    maxAgentSteps: 5,
    maxContextTokens: 8000,
    maxContextMessages: 10,
  } as ObsidianAISettings;
}
```

## Test Script: Attachments (`scripts/test-attachments.ts`)

```typescript
import { createMockApp } from "./lib/mockApp";
import { createAttachment, resolveAttachments } from "../src/context/AttachmentEngine";

async function main() {
  const vaultRoot = process.argv[2] || "./test-vault";
  const filePaths = process.argv.slice(3);

  if (filePaths.length === 0) {
    console.error("Usage: npx tsx scripts/test-attachments.ts <vault-root> <file1> [file2...]");
    process.exit(1);
  }

  const app = createMockApp(vaultRoot);
  const attachments = filePaths.map(createAttachment);

  for (const provider of ["gemini", "openai", "anthropic"]) {
    console.log(`\n=== ${provider.toUpperCase()} ===`);
    const parts = await resolveAttachments(attachments, app, provider);
    console.log(JSON.stringify(parts, null, 2));
  }
}

main().catch(console.error);
```

## Test Script: Stream Chat (`scripts/test-stream-chat.ts`)

```typescript
import { ChatApiManager } from "../src/api";
import { loadSettings } from "./lib/loadSettings";
import { createMockApp } from "./lib/mockApp";

async function main() {
  const prompt = process.argv[2] || "Hello, what is loop quantum gravity?";
  const provider = process.argv[3] || "gemini";

  const settings = loadSettings();
  const app = createMockApp("./test-vault");
  const api = new ChatApiManager(settings as any, app);

  const profile = settings.providerProfiles?.find((p) => p.id === `${provider}-test`);
  if (!profile?.apiKey) {
    console.error(`No API key for ${provider}. Set ${provider.toUpperCase()}_API_KEY.`);
    process.exit(1);
  }

  console.log(`Prompt: ${prompt}\n`);
  console.log("Response:\n");

  for await (const chunk of api.streamChat(
    [{ role: "user", content: prompt }],
    undefined,
    profile,
  )) {
    process.stdout.write(chunk);
  }

  console.log("\n");
}

main().catch(console.error);
```

## Test Script: Multimodal (`scripts/test-multimodal.ts`)

```typescript
import { ChatApiManager, SdkMessage } from "../src/api";
import { loadSettings } from "./lib/loadSettings";
import { createMockApp } from "./lib/mockApp";
import { createAttachment, resolveAttachments } from "../src/context/AttachmentEngine";

async function main() {
  const imagePath = process.argv[2];
  const prompt = process.argv[3] || "Describe this image in detail.";
  const provider = process.argv[4] || "gemini";

  if (!imagePath) {
    console.error("Usage: npx tsx scripts/test-multimodal.ts <image-path> [prompt] [provider]");
    process.exit(1);
  }

  const settings = loadSettings();
  const app = createMockApp("./test-vault");
  const api = new ChatApiManager(settings as any, app);

  const profile = settings.providerProfiles?.find((p) => p.id === `${provider}-test`);
  if (!profile?.apiKey) {
    console.error(`No API key for ${provider}.`);
    process.exit(1);
  }

  // Resolve image attachment
  const attachment = createAttachment(imagePath);
  const parts = await resolveAttachments([attachment], app, provider);

  const messages: SdkMessage[] = [
    { role: "user", content: [{ type: "text", text: prompt }, ...parts] },
  ];

  console.log(`Sending ${provider} an image + prompt...\n`);
  for await (const chunk of api.streamChat(messages, undefined, profile)) {
    process.stdout.write(chunk);
  }
  console.log("\n");
}

main().catch(console.error);
```

## Package.json Scripts

```json
{
  "scripts": {
    "test:attachments": "tsx scripts/test-attachments.ts ./test-vault",
    "test:stream": "tsx scripts/test-stream-chat.ts",
    "test:tools": "tsx scripts/test-tool-calling.ts",
    "test:multimodal": "tsx scripts/test-multimodal.ts",
    "test:pdf": "tsx scripts/test-pdf.ts"
  }
}
```

## Dependencies

- `tsx` — TypeScript execution (already in devDependencies)
- `dotenv` — `.env` file loading (add to devDependencies)

## Security

- `.env` and `~/.obsidian-ai-test-keys.json` must be in `.gitignore`
- Never log full API keys — redact to `sk-...XXXX` format
- Scripts should validate key presence and exit gracefully if missing

## Usage Examples

```bash
# Test attachment resolution
npx tsx scripts/test-attachments.ts ~/vault note.md image.png paper.pdf

# Test streaming with Gemini
GEMINI_API_KEY=xxx npx tsx scripts/test-stream-chat.ts "What is quantum gravity?" gemini

# Test vision with OpenAI
OPENAI_API_KEY=xxx npx tsx scripts/test-multimodal.ts ~/vault/diagram.png "Explain this diagram" openai

# Test PDF with Gemini
GEMINI_API_KEY=xxx npx tsx scripts/test-pdf.ts ~/vault/paper.pdf "Summarize this paper" gemini
```

## Created
2026-05-25 by Sage (user request)
