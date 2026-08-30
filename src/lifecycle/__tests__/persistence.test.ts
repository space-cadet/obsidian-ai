import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	loadSettings,
	saveSettings,
	loadChatData,
	saveChatData,
	scheduleAutoSync,
} from "../persistence";
import { DEFAULT_SETTINGS } from "../../settings";
import type ObsidianAIPlugin from "../../main";

// ── Mocks ──────────────────────────────────────────────────────────────

const createMockPlugin = (overrides: Partial<ObsidianAIPlugin> = {}): ObsidianAIPlugin => {
	return {
		app: {
			vault: {
				adapter: {
					exists: vi.fn().mockResolvedValue(false),
					read: vi.fn().mockResolvedValue("{}"),
					write: vi.fn().mockResolvedValue(undefined),
					mkdir: vi.fn().mockResolvedValue(undefined),
					list: vi.fn().mockResolvedValue({ folders: [], files: [] }),
				},
				configDir: ".obsidian",
				getName: () => "TestVault",
			},
		} as any,
		manifest: { id: "obsidian-ai-chat-lab" } as any,
		settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
		logger: {
			log: vi.fn(),
			setMaxSize: vi.fn(),
			init: vi.fn().mockResolvedValue(undefined),
			stopMemoryLogging: vi.fn(),
			flushNow: vi.fn(),
		} as any,
		_chatStorage: null,
		_saveInProgress: false,
		_pendingChatData: null,
		_settingsLoadedFromFile: false,
		loadData: vi.fn().mockResolvedValue(null),
		saveData: vi.fn().mockResolvedValue(undefined),
		searchIndex: { invalidate: vi.fn() } as any,
		...overrides,
	} as ObsidianAIPlugin;
};

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
		removeItem: vi.fn((key: string) => { delete store[key]; }),
		clear: vi.fn(() => { store = {}; }),
		_store: store,
	};
})();

Object.defineProperty(window, "localStorage", {
	value: localStorageMock,
	writable: true,
});

describe("persistence", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorageMock.clear();
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ── loadSettings ───────────────────────────────────────────────────

	describe("loadSettings", () => {
		it("normalizes null data to defaults", async () => {
			const plugin = createMockPlugin();
			plugin.loadData = vi.fn().mockResolvedValue(null);

			await loadSettings(plugin);

			expect(plugin.settings).toBeDefined();
			expect(plugin._settingsLoadedFromFile).toBe(false);
			expect(plugin.logger.log).toHaveBeenCalledWith(
				"info",
				expect.stringContaining("raw=null"),
			);
		});

		it("normalizes empty object to defaults", async () => {
			const plugin = createMockPlugin();
			plugin.loadData = vi.fn().mockResolvedValue({});

			await loadSettings(plugin);

			expect(plugin._settingsLoadedFromFile).toBe(true);
			expect(plugin.settings.providerProfiles).toBeDefined();
		});

		it("restores WebDAV password from localStorage", async () => {
			const plugin = createMockPlugin();
			plugin.loadData = vi.fn().mockResolvedValue({
				remoteStorage: { webdav: { url: "http://example.com" } },
			});
			localStorageMock.setItem("obsidian-ai:webdav-password", "secret123");

			await loadSettings(plugin);

			expect(plugin.settings.remoteStorage.webdav?.password).toBe("secret123");
		});

		it("sets logger max size from settings", async () => {
			const plugin = createMockPlugin();
			plugin.loadData = vi.fn().mockResolvedValue({
				debugLogMaxSizeMB: 50,
			});

			await loadSettings(plugin);

			expect(plugin.logger.setMaxSize).toHaveBeenCalledWith(50 * 1024 * 1024);
		});
	});

	// ── saveSettings ───────────────────────────────────────────────────

	describe("saveSettings", () => {
		it("blocks write if settings were never loaded from file", async () => {
			const plugin = createMockPlugin();
			plugin._settingsLoadedFromFile = false;
			plugin.loadData = vi.fn().mockResolvedValue({ existing: true });

			await saveSettings(plugin);

			expect(plugin.saveData).not.toHaveBeenCalled();
			expect(plugin.logger.log).toHaveBeenCalledWith(
				"warn",
				expect.stringContaining("blocked"),
			);
		});

		it("writes data.json when settings changed", async () => {
			const plugin = createMockPlugin();
			plugin._settingsLoadedFromFile = true;
			const loadDataFn = vi.fn().mockResolvedValue({ old: "value" });
			plugin.loadData = loadDataFn;
			plugin.settings = { ...DEFAULT_SETTINGS, debugLogMaxSizeMB: 99 };

			await saveSettings(plugin);

			expect(plugin.saveData).toHaveBeenCalledOnce();
			const saveFn = plugin.saveData as ReturnType<typeof vi.fn>;
			const payload = saveFn.mock.calls[0][0];
			expect(payload.debugLogMaxSizeMB).toBe(99);
		});

		it("strips WebDAV password from persisted data", async () => {
			const plugin = createMockPlugin();
			plugin._settingsLoadedFromFile = true;
			plugin.loadData = vi.fn().mockResolvedValue({});
			plugin.settings = {
				...DEFAULT_SETTINGS,
				remoteStorage: {
					...DEFAULT_SETTINGS.remoteStorage,
					webdav: { type: "webdav", url: "http://example.com", password: "secret", username: "user", prefix: "/", enabled: true },
				},
			};

			await saveSettings(plugin);

			const saveFn = plugin.saveData as ReturnType<typeof vi.fn>;
			const payload = saveFn.mock.calls[0][0];
			expect(payload.remoteStorage.webdav.password).toBe("");
		});

		it("saves WebDAV password to localStorage", async () => {
			const plugin = createMockPlugin();
			plugin._settingsLoadedFromFile = true;
			plugin.loadData = vi.fn().mockResolvedValue({});
			plugin.settings = {
				...DEFAULT_SETTINGS,
				remoteStorage: {
					...DEFAULT_SETTINGS.remoteStorage,
					webdav: { type: "webdav", url: "http://example.com", password: "secret", username: "user", prefix: "/", enabled: true },
				},
			};

			await saveSettings(plugin);

			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				"obsidian-ai:webdav-password",
				"secret",
			);
		});

		it("clears localStorage password when empty", async () => {
			const plugin = createMockPlugin();
			plugin._settingsLoadedFromFile = true;
			plugin.loadData = vi.fn().mockResolvedValue({});
			plugin.settings = {
				...DEFAULT_SETTINGS,
				remoteStorage: {
					...DEFAULT_SETTINGS.remoteStorage,
					webdav: { type: "webdav", url: "http://example.com", password: "", username: "user", prefix: "/", enabled: true },
				},
			};

			await saveSettings(plugin);

			expect(localStorageMock.removeItem).toHaveBeenCalledWith(
				"obsidian-ai:webdav-password",
			);
		});

		it("skips write if data unchanged", async () => {
			const plugin = createMockPlugin();
			plugin._settingsLoadedFromFile = true;
			const existing = { ...DEFAULT_SETTINGS };
			const loadDataFn = vi.fn().mockResolvedValue(existing);
			plugin.loadData = loadDataFn;
			plugin.settings = JSON.parse(JSON.stringify(existing));

			await saveSettings(plugin);

			expect(plugin.saveData).not.toHaveBeenCalled();
			expect(plugin.logger.log).toHaveBeenCalledWith(
				"info",
				expect.stringContaining("skipped"),
			);
		});

		it("strips legacy chat keys when using jsonl format", async () => {
			const plugin = createMockPlugin();
			plugin._settingsLoadedFromFile = true;
			plugin.loadData = vi.fn().mockResolvedValue({
				chatData: { sessions: [] },
				chatMessages: [],
			});
			plugin.settings = {
				...DEFAULT_SETTINGS,
				chatStorageFormat: "jsonl",
			};

			await saveSettings(plugin);

			const saveFn = plugin.saveData as ReturnType<typeof vi.fn>;
			const payload = saveFn.mock.calls[0][0];
			expect(payload.chatData).toBeUndefined();
			expect(payload.chatMessages).toBeUndefined();
		});
	});

	// ── loadChatData ───────────────────────────────────────────────────

	describe("loadChatData", () => {
		it("creates storage if not initialized and delegates load", async () => {
			const plugin = createMockPlugin();
			const mockStorage = {
				loadChatData: vi.fn().mockResolvedValue({ sessions: [], messages: {} }),
			};
			plugin.settings = { ...DEFAULT_SETTINGS, chatStorageFormat: "jsonl" };
			plugin._chatStorage = mockStorage as any;

			const result = await loadChatData(plugin);

			expect(mockStorage.loadChatData).toHaveBeenCalled();
			expect(result).toEqual({ sessions: [], messages: {} });
		});
	});

	// ── saveChatData ───────────────────────────────────────────────────

	describe("saveChatData", () => {
		it("writes chat data through storage layer", async () => {
			const plugin = createMockPlugin();
			const mockStorage = {
				saveChatData: vi.fn().mockResolvedValue(undefined),
			};
			plugin._chatStorage = mockStorage as any;
			plugin.settings = { ...DEFAULT_SETTINGS, chatStorageFormat: "jsonl" };
			const chatData = { sessions: [], messages: {} };

			await saveChatData(plugin, chatData as any);

			expect(mockStorage.saveChatData).toHaveBeenCalledWith(chatData);
		});

		it("queues writes when save is already in progress", async () => {
			const plugin = createMockPlugin();
			const mockStorage = {
				saveChatData: vi.fn().mockImplementation(() => {
					return new Promise((resolve) => setTimeout(resolve, 100));
				}),
			};
			plugin._chatStorage = mockStorage as any;
			plugin.settings = { ...DEFAULT_SETTINGS, chatStorageFormat: "jsonl" };

			const chatData1 = { sessions: [{ id: "1" }], messages: {} };
			const chatData2 = { sessions: [{ id: "2" }], messages: {} };

			// Start first save
			const promise1 = saveChatData(plugin, chatData1 as any);
			await Promise.resolve(); // let the microtask queue run

			// While first is in progress, trigger second
			plugin._saveInProgress = true;
			const promise2 = saveChatData(plugin, chatData2 as any);

			expect(plugin._pendingChatData).toEqual(chatData2);
			expect(plugin.logger.log).toHaveBeenCalledWith(
				"info",
				expect.stringContaining("queued"),
			);
		});

		it("schedules auto-sync when remote storage is enabled", async () => {
			const plugin = createMockPlugin();
			const mockStorage = {
				saveChatData: vi.fn().mockResolvedValue(undefined),
			};
			plugin._chatStorage = mockStorage as any;
			plugin.settings = {
				...DEFAULT_SETTINGS,
				remoteStorage: {
					...DEFAULT_SETTINGS.remoteStorage,
					enabled: true,
					autoSync: true,
				},
			};
			plugin.triggerSync = vi.fn().mockResolvedValue(undefined);

			await saveChatData(plugin, { sessions: [], messages: {} } as any);

			// Auto-sync is debounced, advance timers
			vi.advanceTimersByTime(3000);
			expect(plugin.triggerSync).toHaveBeenCalled();
		});

		it("invalidates search index after save", async () => {
			const plugin = createMockPlugin();
			const mockStorage = {
				saveChatData: vi.fn().mockResolvedValue(undefined),
			};
			plugin._chatStorage = mockStorage as any;
			plugin.settings = DEFAULT_SETTINGS;

			await saveChatData(plugin, { sessions: [], messages: {} } as any);

			expect(plugin.searchIndex!.invalidate).toHaveBeenCalled();
		});
	});

	// ── scheduleAutoSync ───────────────────────────────────────────────

	describe("scheduleAutoSync", () => {
		it("debounces sync calls within 3 seconds", async () => {
			const plugin = createMockPlugin();
			plugin.settings = {
				...DEFAULT_SETTINGS,
				remoteStorage: {
					...DEFAULT_SETTINGS.remoteStorage,
					enabled: true,
					autoSync: true,
				},
			};
			plugin.triggerSync = vi.fn().mockResolvedValue(undefined);

			scheduleAutoSync(plugin);
			scheduleAutoSync(plugin);
			scheduleAutoSync(plugin);

			// Should only trigger once after 3s
			vi.advanceTimersByTime(3000);
			expect(plugin.triggerSync).toHaveBeenCalledTimes(1);
		});

		it("does not sync when autoSync is disabled", async () => {
			const plugin = createMockPlugin();
			plugin.settings = {
				...DEFAULT_SETTINGS,
				remoteStorage: {
					...DEFAULT_SETTINGS.remoteStorage,
					enabled: true,
					autoSync: false,
				},
			};
			plugin.triggerSync = vi.fn().mockResolvedValue(undefined);

			scheduleAutoSync(plugin);
			vi.advanceTimersByTime(3000);

			expect(plugin.triggerSync).not.toHaveBeenCalled();
		});
	});
});
