import { describe, expect, it, vi } from "vitest";
import { ChatStorageMigration } from "../Migration";

describe("ChatStorageMigration", () => {
	it("preserves session tags and automatic-tag state in the JSONL index", async () => {
		const files = new Map<string, string>();
		const adapter = {
			exists: vi.fn(async (path: string) => files.has(path)),
			mkdir: vi.fn(async () => undefined),
			write: vi.fn(async (path: string, content: string) => {
				files.set(path, content);
			}),
		};
		const legacyData = {
			settings: { theme: "dark" },
			chatData: {
				activeSessionId: "tagged-session",
				sessions: [
					{
						id: "tagged-session",
						title: "Tagged session",
						createdAt: 1,
						updatedAt: 2,
						contextItems: [],
						messages: [
							{
								id: "message-1",
								role: "user",
								content: "Hello",
								timestamp: 1,
							},
						],
						tags: ["research-notes", "AI"],
						autoTagPending: true,
					},
				],
			},
		};
		const saveData = vi.fn(async () => undefined);
		const migration = new ChatStorageMigration({
			app: { vault: { adapter, configDir: ".obsidian" } } as any,
			manifest: { id: "obsidian-ai" },
			settings: {} as any,
			loadData: vi.fn(async () => legacyData),
			saveData,
		} as any);

		const result = await migration.migrate();

		expect(result.success).toBe(true);
		const index = JSON.parse(
			files.get(".obsidian/plugins/obsidian-ai/sessions/index.json") ??
				"{}",
		);
		expect(index.sessions[0]).toMatchObject({
			tags: ["research-notes", "AI"],
			autoTagPending: true,
		});
		expect(saveData).toHaveBeenCalledWith({ settings: { theme: "dark" } });
	});
});
