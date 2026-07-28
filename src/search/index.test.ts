import { describe, it, expect } from "vitest";
import { SearchIndex } from "./index";

// Minimal mock of Obsidian's VaultAdapter + App
function createMockApp(files: Record<string, string>) {
	return {
		vault: {
			configDir: ".obsidian",
			adapter: {
				exists: async (path: string) => path in files || path === ".obsidian/plugins/test-plugin/sessions",
				list: async (path: string) => {
					const files_list = Object.keys(files).filter((f) => f.startsWith(path + "/"));
					return { files: files_list.map((f) => f.split("/").pop()!), folders: [] };
				},
				read: async (path: string) => files[path] ?? "",
			},
		},
	} as any;
}

describe("SearchIndex", () => {
	it("builds index and searches across sessions", async () => {
		const files: Record<string, string> = {
			".obsidian/plugins/test-plugin/sessions/session-a.jsonl": JSON.stringify({
				id: "msg-1",
				role: "user",
				content: "Hello world from session A",
				timestamp: 1000,
			}) + "\n" + JSON.stringify({
				id: "msg-2",
				role: "assistant",
				content: "Goodbye world",
				timestamp: 2000,
			}) + "\n",
			".obsidian/plugins/test-plugin/sessions/session-b.jsonl": JSON.stringify({
				id: "msg-3",
				role: "user",
				content: "Hello again from session B",
				timestamp: 3000,
			}) + "\n",
		};

		const app = createMockApp(files);
		const search = new SearchIndex(app, "test-plugin");
		await search.buildIndex();

		// Search for "hello" should match both sessions
		const results = await search.search("hello");
		expect(results.length).toBe(2);
		expect(results[0].sessionId).toBe("session-b"); // most recent first
		expect(results[1].sessionId).toBe("session-a");
	});

	it("returns empty array for no matches", async () => {
		const files: Record<string, string> = {
			".obsidian/plugins/test-plugin/sessions/session-a.jsonl": JSON.stringify({
				id: "msg-1",
				role: "user",
				content: "Hello world",
				timestamp: 1000,
			}) + "\n",
		};

		const app = createMockApp(files);
		const search = new SearchIndex(app, "test-plugin");
		const results = await search.search("xyznotfound");
		expect(results).toEqual([]);
	});

	it("handles intersection of multiple query words", async () => {
		const files: Record<string, string> = {
			".obsidian/plugins/test-plugin/sessions/session-a.jsonl": JSON.stringify({
				id: "msg-1",
				role: "user",
				content: "quantum gravity research",
				timestamp: 1000,
			}) + "\n" + JSON.stringify({
				id: "msg-2",
				role: "user",
				content: "quantum computing is different",
				timestamp: 2000,
			}) + "\n",
		};

		const app = createMockApp(files);
		const search = new SearchIndex(app, "test-plugin");
		const results = await search.search("quantum gravity");
		expect(results.length).toBe(1);
		expect(results[0].messageId).toBe("msg-1");
	});

	it("handles empty sessions directory gracefully", async () => {
		const app = createMockApp({});
		const search = new SearchIndex(app, "test-plugin");
		await search.buildIndex();
		const results = await search.search("hello");
		expect(results).toEqual([]);
	});

	it("falls back to legacy data.json when no JSONL files exist", async () => {
		const files: Record<string, string> = {
			".obsidian/plugins/test-plugin/data.json": JSON.stringify({
				chatData: {
					sessions: [
						{
							id: "legacy-session-1",
							title: "Test Session",
							createdAt: 1000,
							updatedAt: 2000,
							messages: [
								{
									id: "msg-1",
									role: "user",
									content: "Hello from legacy storage",
									timestamp: 1000,
								},
							],
							contextItems: [],
						},
					],
					activeSessionId: "legacy-session-1",
				},
			}),
		};

		const app = createMockApp(files);
		const search = new SearchIndex(app, "test-plugin");
		const results = await search.search("legacy");
		expect(results.length).toBe(1);
		expect(results[0].sessionId).toBe("legacy-session-1");
	});

	it("prefers JSONL over legacy data.json when both exist", async () => {
		const files: Record<string, string> = {
			".obsidian/plugins/test-plugin/sessions/session-a.jsonl": JSON.stringify({
				id: "msg-jsonl",
				role: "user",
				content: "Hello from JSONL",
				timestamp: 1000,
			}) + "\n",
			".obsidian/plugins/test-plugin/data.json": JSON.stringify({
				chatData: {
					sessions: [
						{
							id: "legacy-session-1",
							title: "Legacy",
							createdAt: 1000,
							updatedAt: 2000,
							messages: [
								{
									id: "msg-legacy",
									role: "user",
									content: "Hello from legacy",
									timestamp: 1000,
								},
							],
							contextItems: [],
						},
					],
					activeSessionId: "legacy-session-1",
				},
			}),
		};

		const app = createMockApp(files);
		const search = new SearchIndex(app, "test-plugin");
		const results = await search.search("JSONL");
		expect(results.length).toBe(1);
		expect(results[0].messageId).toBe("msg-jsonl");
	});

	it("returns snippets up to 200 chars", async () => {
		const longContent = "research ".repeat(100); // 900 chars, non-stop word
		const files: Record<string, string> = {
			".obsidian/plugins/test-plugin/sessions/session-a.jsonl": JSON.stringify({
				id: "msg-1",
				role: "user",
				content: longContent,
				timestamp: 1000,
			}) + "\n",
		};

		const app = createMockApp(files);
		const search = new SearchIndex(app, "test-plugin");
		const results = await search.search("research");
		expect(results[0].snippet.length).toBe(200);
	});
});
