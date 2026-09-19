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


function makeAdapter(files: Map<string, string>) {
	return {
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
}

function makeStorage(files: Map<string, string>) {
	const adapter = makeAdapter(files);
	const storage = createStorage(
		{
			app: { vault: { adapter, configDir: ".obsidian" } } as any,
			manifest: { id: "obsidian-ai" },
			settings: {} as any,
			loadData: vi.fn(async () => ({})),
			saveData: vi.fn(async () => undefined),
		},
		"jsonl",
	);
	return { storage, adapter };
}

function makeSession(id: string, texts: string[]): ChatSession {
	return {
		id,
		title: `Session ${id}`,
		createdAt: 1,
		updatedAt: 2,
		messages: texts.map((content, i) => ({
			id: `${id}-msg-${i}`,
			role: "user" as const,
			content,
			timestamp: i + 1,
		})),
		contextItems: [],
	};
}

const sessionPath = (id: string) =>
	`.obsidian/plugins/obsidian-ai/sessions/${id}.jsonl`;
const indexPath = ".obsidian/plugins/obsidian-ai/sessions/index.json";

describe("JsonlStorage index-only boot", () => {
	it("default load returns metadata with empty messages; hydrate:true returns full messages", async () => {
		const files = new Map<string, string>();
		const { storage } = makeStorage(files);
		await storage.saveChatData({
			sessions: [makeSession("s1", ["hello", "world"])],
			activeSessionId: "s1",
		});

		// Fresh instance simulates plugin boot.
		const boot = makeStorage(files).storage;
		const data = await boot.loadChatData();
		expect(data.sessions[0].messages).toEqual([]);
		expect(data.sessions[0].messageCount).toBe(2);
		expect(data.sessions[0].hydrated).toBe(false);
		expect(data.sessions[0].title).toBe("Session s1");

		const full = await makeStorage(files).storage.loadChatData({
			hydrate: true,
		});
		expect(full.sessions[0].messages).toHaveLength(2);
		expect(full.sessions[0].hydrated).toBe(true);
	});

	it("hydrateSession returns real messages once, then reports hydrated", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("s1", ["a", "b", "c"])],
			activeSessionId: "s1",
		});
		const { storage, adapter } = makeStorage(files);
		await storage.loadChatData();

		expect(storage.isSessionHydrated?.("s1")).toBe(false);
		const messages = await storage.hydrateSession?.("s1");
		expect(messages).toHaveLength(3);
		expect(messages?.[2].content).toBe("c");
		expect(storage.isSessionHydrated?.("s1")).toBe(true);
		// Second call: already hydrated, no file read.
		const again = await storage.hydrateSession?.("s1");
		expect(again).toEqual([]);
		const reads = (adapter.read as any).mock.calls.filter((c: string[]) =>
			c[0].endsWith("s1.jsonl"),
		);
		expect(reads).toHaveLength(1);
	});

	it("concurrent hydrateSession calls share one file read", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("s1", ["x"])],
			activeSessionId: "s1",
		});
		const { storage, adapter } = makeStorage(files);
		await storage.loadChatData();
		const [a, b] = await Promise.all([
			storage.hydrateSession?.("s1"),
			storage.hydrateSession?.("s1"),
		]);
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
		const reads = (adapter.read as any).mock.calls.filter((c: string[]) =>
			c[0].endsWith("s1.jsonl"),
		);
		expect(reads).toHaveLength(1);
	});

	it("hard guard: saving an unhydrated session never touches its file", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("s1", ["precious"])],
			activeSessionId: "s1",
		});
		const before = files.get(sessionPath("s1"));
		const indexBefore = files.get(indexPath);

		// Boot index-only, then save without opening anything.
		const { storage } = makeStorage(files);
		const data = await storage.loadChatData();
		await storage.saveChatData({
			sessions: data.sessions,
			activeSessionId: data.activeSessionId,
		});

		expect(files.get(sessionPath("s1"))).toBe(before);
		const index = JSON.parse(files.get(indexPath) ?? "{}");
		expect(index.sessions[0].messageCount).toBe(1);
		expect(index.sessions[0].title).toBe("Session s1");
		expect(indexBefore).toBeTruthy();
	});

	it("save after hydration persists appended messages", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("s1", ["old"])],
			activeSessionId: "s1",
		});
		const { storage } = makeStorage(files);
		const data = await storage.loadChatData();
		const messages = (await storage.hydrateSession?.("s1")) ?? [];
		messages.push({
			id: "new-msg",
			role: "user",
			content: "new",
			timestamp: 99,
		});
		await storage.saveChatData({
			sessions: [{ ...data.sessions[0], messages }],
			activeSessionId: "s1",
		});
		const reloaded = await makeStorage(files).storage.loadChatData({
			hydrate: true,
		});
		expect(reloaded.sessions[0].messages).toHaveLength(2);
		expect(reloaded.sessions[0].messages[1].content).toBe("new");
	});

	it("sync-style replacement (session gains messages unhydrated) writes full file", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("s1", ["local-old"])],
			activeSessionId: "s1",
		});
		const { storage } = makeStorage(files);
		const data = await storage.loadChatData();
		// Simulate onSessionDownloaded: same id, real remote messages.
		const replaced = {
			...data.sessions[0],
			messages: [
				{
					id: "r1",
					role: "user" as const,
					content: "from-remote",
					timestamp: 5,
				},
			],
			messageCount: 1,
		};
		await storage.saveChatData({
			sessions: [replaced],
			activeSessionId: "s1",
		});
		const reloaded = await makeStorage(files).storage.loadChatData({
			hydrate: true,
		});
		expect(reloaded.sessions[0].messages).toHaveLength(1);
		expect(reloaded.sessions[0].messages[0].content).toBe("from-remote");
	});
});

describe("JsonlStorage hydrate-all write protection (Codex P1)", () => {
	it("hydrate:true full read keeps the save guard for unhydrated sessions", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("s1", ["hello", "world"])],
			activeSessionId: "s1",
		});

		// Fresh instance simulates plugin boot (index-only).
		const { storage, adapter } = makeStorage(files);
		const boot = await storage.loadChatData();
		expect(boot.sessions[0].messages).toEqual([]);

		// Diagnostics-style full read must NOT clear the write guard.
		const full = await storage.loadChatData({ hydrate: true });
		expect(full.sessions[0].messages).toHaveLength(2);
		expect(storage.isSessionHydrated?.("s1")).toBe(false);

		// Autosave carrying the empty unhydrated session must not clobber
		// the .jsonl on disk.
		await storage.saveChatData({
			sessions: boot.sessions,
			activeSessionId: null,
		});
		const written = (
			files.get(sessionPath("s1")) ?? ""
		).trim().split("\n").filter(Boolean);
		expect(written).toHaveLength(2);
		expect(adapter.write).not.toHaveBeenCalledWith(
			sessionPath("s1"),
			expect.anything(),
		);
	});
});

describe("JsonlStorage metadata reads preserve hydration state (Codex wave-3 P1)", () => {
	it("sync-style metadata read does not re-flag an already-hydrated session", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("a", ["hello"]), makeSession("b", ["world"])],
			activeSessionId: "a",
		});

		// Fresh boot, index-only.
		const { storage } = makeStorage(files);
		await storage.loadChatData();
		expect(storage.isSessionHydrated?.("a")).toBe(false);
		expect(storage.isSessionHydrated?.("b")).toBe(false);

		// Open session a.
		const messages = await storage.hydrateSession?.("a");
		expect(messages).toHaveLength(1);
		expect(storage.isSessionHydrated?.("a")).toBe(true);

		// Sync performs a metadata-only index read.
		await storage.loadChatData();

		// a must STAY hydrated — the bug re-flagged it, making a later
		// hydration revert newer in-memory messages to disk state.
		expect(storage.isSessionHydrated?.("a")).toBe(true);
		// b was never opened — the save guard must still protect it.
		expect(storage.isSessionHydrated?.("b")).toBe(false);
	});

	it("hydrateSession stays idempotent across a later metadata read", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("a", ["hello"])],
			activeSessionId: "a",
		});
		const { storage } = makeStorage(files);
		await storage.loadChatData();
		await storage.hydrateSession?.("a");

		await storage.loadChatData(); // sync re-read

		// Already-hydrated ids return [] — no second file read that could
		// overwrite newer UI state with stale disk state.
		const again = await storage.hydrateSession?.("a");
		expect(again).toEqual([]);
	});

	it("save guard still protects never-opened sessions after a metadata read", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("a", ["hello"]), makeSession("b", ["precious"])],
			activeSessionId: "a",
		});
		const before = files.get(sessionPath("b"));

		const { storage } = makeStorage(files);
		const boot = await storage.loadChatData();
		await storage.hydrateSession?.("a");
		await storage.loadChatData(); // sync re-read

		// Autosave carrying both sessions; b is still empty in memory.
		await storage.saveChatData({
			sessions: boot.sessions,
			activeSessionId: "a",
		});
		expect(files.get(sessionPath("b"))).toBe(before);
	});
});

describe("JsonlStorage peekSessionMessages (Codex wave-2)", () => {
	it("reads messages without disturbing the hydration write guard", async () => {
		const files = new Map<string, string>();
		await makeStorage(files).storage.saveChatData({
			sessions: [makeSession("s1", ["hello", "world"])],
			activeSessionId: "s1",
		});

		const { storage, adapter } = makeStorage(files);
		const boot = await storage.loadChatData();
		expect(boot.sessions[0].messages).toEqual([]);

		// Export/copy path: pure read, no hydration bookkeeping.
		const peeked = await storage.peekSessionMessages?.("s1");
		expect(peeked).toHaveLength(2);
		expect(storage.isSessionHydrated?.("s1")).toBe(false);

		// The save guard still protects the unhydrated session.
		await storage.saveChatData({
			sessions: boot.sessions,
			activeSessionId: null,
		});
		expect(adapter.write).not.toHaveBeenCalledWith(
			sessionPath("s1"),
			expect.anything(),
		);
	});
});
