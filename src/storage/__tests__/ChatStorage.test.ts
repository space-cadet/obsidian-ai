import { describe, expect, it, vi } from "vitest";
import type { ChatSession, CompactionMetadata } from "../../types";
import { createStorage } from "../ChatStorage";

describe("ChatStorage", () => {
	it("round-trips compaction metadata through the JSONL session index", async () => {
		const files = new Map<string, string>();
		const adapter = {
			exists: vi.fn(async (path: string) => files.has(path)),
			mkdir: vi.fn(async () => undefined),
			read: vi.fn(async (path: string) => files.get(path) ?? ""),
			write: vi.fn(async (path: string, content: string) => {
				files.set(path, content);
			}),
			append: vi.fn(async (path: string, content: string) => {
				files.set(path, (files.get(path) ?? "") + content);
			}),
		};
		const metadata: CompactionMetadata = {
			version: 1,
			sourceMessageIds: ["message-1"],
			sourceToolCallIds: [],
			summarizedThroughMessageId: "message-1",
			sourceFingerprint: "fnv1a:11111111",
			transcriptFingerprint: "fnv1a:22222222",
			summary: {
				keyDecisions: ["Use bounded replay"],
				toolResults: [],
				userIntent: ["Preserve exact detail"],
				openQuestions: [],
			},
			createdAt: 123,
			model: "test-model",
		};
		const session: ChatSession = {
			id: "session-1",
			title: "Test",
			createdAt: 1,
			updatedAt: 2,
			messages: [
				{
					id: "message-1",
					role: "user",
					content: "Hello",
					timestamp: 1,
				},
			],
			contextItems: [],
			compactionMetadata: metadata,
		};
		const storage = createStorage(
			{
				app: {
					vault: { adapter, configDir: ".obsidian" },
				} as any,
				manifest: { id: "obsidian-ai" },
				settings: {} as any,
				loadData: vi.fn(async () => ({})),
				saveData: vi.fn(async () => undefined),
			},
			"jsonl",
		);

		await storage.saveChatData({
			sessions: [session],
			activeSessionId: session.id,
		});
		const indexPath = ".obsidian/plugins/obsidian-ai/sessions/index.json";
		const index = JSON.parse(files.get(indexPath) ?? "{}");
		expect(index.sessions[0].compactionMetadata).toEqual(metadata);

		const loaded = await storage.loadChatData();
		expect(loaded.sessions[0].compactionMetadata).toEqual(metadata);
	});
});
