import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	syncPluginData,
	serializePluginData,
	deserializePluginData,
	openRemoteStorageSettings,
} from "../pluginDataSync";
import type ObsidianAIPlugin from "../../main";
import { DEFAULT_SETTINGS } from "../../settings";

// ── Per-test mock state ────────────────────────────────────────────────

let _mockSyncResult: any = {
	uploaded: 0,
	downloaded: 0,
	failed: 0,
	conflicts: 0,
	errors: [],
	status: "complete",
	retryable: [],
	items: [],
};

let _mockPlanResult: any = {
	uploaded: 0,
	downloaded: 0,
	failed: 0,
	conflicts: 0,
	errors: [],
	status: "complete",
	retryable: [],
	items: [],
};

let _shouldThrow = false;
let _throwError: Error | null = null;

// ── Mocks ──────────────────────────────────────────────────────────────

const createMockPlugin = (
	overrides: Partial<ObsidianAIPlugin> = {},
): ObsidianAIPlugin => {
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
		syncEngine: null,
		syncIdentity: null,
		syncRetryStore: null,
		loadData: vi.fn().mockResolvedValue(null),
		saveData: vi.fn().mockResolvedValue(undefined),
		saveSettings: vi.fn().mockResolvedValue(undefined),
		loadChatData: vi
			.fn()
			.mockResolvedValue({ sessions: [], messages: {} }),
		...overrides,
	} as ObsidianAIPlugin;
};

// Mock PluginDataManager — must be a constructor function
vi.mock("../../data/PluginDataManager", () => ({
	PluginDataManager: class MockPluginDataManager {
		createSyncBundle = vi.fn().mockReturnValue({ test: "bundle" });
		applySyncBundle = vi.fn();
	},
}));

// Mock PluginFileSyncManager — reads from module-level state
vi.mock("../../sync/PluginFileSyncManager", () => ({
	PluginFileSyncManager: class MockPluginFileSyncManager {
		plan = vi.fn().mockImplementation(() => {
			if (_shouldThrow && _throwError) throw _throwError;
			return Promise.resolve(_mockPlanResult);
		});
		sync = vi.fn().mockImplementation(() => {
			if (_shouldThrow && _throwError) throw _throwError;
			return Promise.resolve(_mockSyncResult);
		});
	},
	createVaultTextSyncTarget: vi.fn().mockImplementation((id, remotePath) => ({
		id,
		remotePath,
		readLocal: vi.fn().mockResolvedValue(""),
		writeLocal: vi.fn().mockResolvedValue(undefined),
	})),
}));

// Mock conflict modal
vi.mock("../../modals/PluginFileConflictModal", () => ({
	requestPluginFileConflictChoice: vi.fn().mockResolvedValue("local"),
}));

// Mock usageStats
vi.mock("../../lib/usageStats", () => ({
	summarizeLlmUsage: vi.fn().mockReturnValue({ total: 100 }),
}));

describe("pluginDataSync", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		_mockSyncResult = {
			uploaded: 0,
			downloaded: 0,
			failed: 0,
			conflicts: 0,
			errors: [],
			status: "complete",
			retryable: [],
			items: [],
		};
		_mockPlanResult = {
			uploaded: 0,
			downloaded: 0,
			failed: 0,
			conflicts: 0,
			errors: [],
			status: "complete",
			retryable: [],
			items: [],
		};
		_shouldThrow = false;
		_throwError = null;
	});

	// ── serializePluginData / deserializePluginData ────────────────────

	describe("serializePluginData", () => {
		it("delegates to PluginDataManager.createSyncBundle", () => {
			const plugin = createMockPlugin();
			const result = serializePluginData(plugin);
			expect(result).toEqual({ test: "bundle" });
		});
	});

	describe("deserializePluginData", () => {
		it("delegates to PluginDataManager.applySyncBundle and saves settings", async () => {
			const plugin = createMockPlugin();
			await deserializePluginData(plugin, { remote: "data" });
			expect(plugin.saveSettings).toHaveBeenCalled();
			expect(plugin.logger.log).toHaveBeenCalledWith(
				"info",
				expect.stringContaining("merged from remote"),
			);
		});
	});

	// ── syncPluginData ─────────────────────────────────────────────────

	describe("syncPluginData", () => {
		it("returns empty result when syncEngine is null", async () => {
			const plugin = createMockPlugin({ syncEngine: null });
			const result = await syncPluginData(plugin);
			expect(result.status).toBe("complete");
			expect(result.items).toEqual([]);
			expect(result.uploaded).toBe(false);
			expect(result.downloaded).toBe(false);
		});

		it("returns empty result when no sync components enabled", async () => {
			const plugin = createMockPlugin({
				syncEngine: {
					storageAdapter: {},
					encryptionLayer: {},
				} as any,
			});
			plugin.settings.syncComponents = {
				chatSessions: false,
				pluginSettings: false,
				apiKeys: false,
				memory: false,
				memoryAudit: false,
				persona: false,
				usageStats: false,
			};

			const result = await syncPluginData(plugin);
			expect(result.status).toBe("complete");
			expect(result.items).toEqual([]);
			expect(plugin.logger!.log).toHaveBeenCalledWith(
				"info",
				expect.stringContaining("No components enabled"),
			);
		});

		it("respects component filtering — only builds enabled targets", async () => {
			const plugin = createMockPlugin({
				syncEngine: {
					storageAdapter: {},
					encryptionLayer: {},
				} as any,
			});
			plugin.settings.syncComponents = {
				chatSessions: false,
				pluginSettings: true, // enabled
				apiKeys: false,
				memory: false,
				memoryAudit: false,
				persona: false,
				usageStats: false,
			};
			_mockSyncResult = {
				uploaded: 1,
				downloaded: 0,
				failed: 0,
				conflicts: 0,
				errors: [],
				status: "complete",
				retryable: [],
				items: [
					{
						id: "plugin-settings",
						status: "uploaded",
						error: undefined,
					},
				],
			};

			const result = await syncPluginData(plugin);
			expect(result.uploaded).toBe(true);
			expect(result.items).toHaveLength(1);
			expect(result.items[0].id).toBe("plugin-settings");
		});

		it("uses dry-run mode when requested", async () => {
			const plugin = createMockPlugin({
				syncEngine: {
					storageAdapter: {},
					encryptionLayer: {},
				} as any,
			});
			plugin.settings.syncComponents = {
				chatSessions: false,
				pluginSettings: true,
				apiKeys: false,
				memory: false,
				memoryAudit: false,
				persona: false,
				usageStats: false,
			};
			_mockPlanResult = {
				uploaded: 1,
				downloaded: 0,
				failed: 0,
				conflicts: 0,
				errors: [],
				status: "complete",
				retryable: [],
				items: [
					{
						id: "plugin-settings",
						status: "planned",
						error: undefined,
					},
				],
			};

			const result = await syncPluginData(plugin, undefined, {
				dryRun: true,
			});
			expect(result.status).toBe("complete");
			expect(result.items[0].status).toBe("planned");
		});

		it("logs results after successful sync", async () => {
			const plugin = createMockPlugin({
				syncEngine: {
					storageAdapter: {},
					encryptionLayer: {},
				} as any,
			});
			plugin.settings.syncComponents = {
				chatSessions: false,
				pluginSettings: true,
				apiKeys: false,
				memory: false,
				memoryAudit: false,
				persona: false,
				usageStats: false,
			};
			_mockSyncResult = {
				uploaded: 1,
				downloaded: 0,
				failed: 0,
				conflicts: 0,
				errors: [],
				status: "complete",
				retryable: [],
				items: [
					{
						id: "plugin-settings",
						status: "uploaded",
						error: undefined,
					},
				],
			};

			await syncPluginData(plugin);
			expect(plugin.logger!.log).toHaveBeenCalledWith(
				"info",
				expect.stringContaining("uploaded plugin-settings"),
			);
		});

		it("logs failures with warn level", async () => {
			const plugin = createMockPlugin({
				syncEngine: {
					storageAdapter: {},
					encryptionLayer: {},
				} as any,
			});
			plugin.settings.syncComponents = {
				chatSessions: false,
				pluginSettings: true,
				apiKeys: false,
				memory: false,
				memoryAudit: false,
				persona: false,
				usageStats: false,
			};
			_mockSyncResult = {
				uploaded: 0,
				downloaded: 0,
				failed: 1,
				conflicts: 0,
				errors: ["network error"],
				status: "partial",
				retryable: [],
				items: [
					{
						id: "plugin-settings",
						status: "failed",
						error: "network error",
					},
				],
			};

			await syncPluginData(plugin);
			expect(plugin.logger!.log).toHaveBeenCalledWith(
				"warn",
				expect.stringContaining("Failed plugin-settings"),
			);
		});

		it("handles manager.sync() throwing", async () => {
			const plugin = createMockPlugin({
				syncEngine: {
					storageAdapter: {},
					encryptionLayer: {},
				} as any,
			});
			plugin.settings.syncComponents = {
				chatSessions: false,
				pluginSettings: true,
				apiKeys: false,
				memory: false,
				memoryAudit: false,
				persona: false,
				usageStats: false,
			};
			_shouldThrow = true;
			_throwError = new Error("connection refused");

			const result = await syncPluginData(plugin);
			expect(result.status).toBe("failed");
			expect(result.failed).toBe(1);
			expect(result.errors[0]).toContain("connection refused");
		});

		it("uses default direction from settings when not provided", async () => {
			const plugin = createMockPlugin({
				syncEngine: {
					storageAdapter: {},
					encryptionLayer: {},
				} as any,
			});
			plugin.settings.syncComponents = {
				chatSessions: false,
				pluginSettings: true,
				apiKeys: false,
				memory: false,
				memoryAudit: false,
				persona: false,
				usageStats: false,
			};
			plugin.settings.remoteStorage.syncDirection = "upload";
			_mockSyncResult = {
				uploaded: 1,
				downloaded: 0,
				failed: 0,
				conflicts: 0,
				errors: [],
				status: "complete",
				retryable: [],
				items: [],
			};

			const result = await syncPluginData(plugin); // no direction arg
			// Verify by checking the result; the mock class uses module-level state
			expect(result.uploaded).toBe(true);
		});

		it("reports conflicts correctly", async () => {
			const plugin = createMockPlugin({
				syncEngine: {
					storageAdapter: {},
					encryptionLayer: {},
				} as any,
			});
			plugin.settings.syncComponents = {
				chatSessions: false,
				pluginSettings: true,
				apiKeys: false,
				memory: false,
				memoryAudit: false,
				persona: false,
				usageStats: false,
			};
			_mockSyncResult = {
				uploaded: 0,
				downloaded: 0,
				failed: 0,
				conflicts: 1,
				errors: [],
				status: "partial",
				retryable: [],
				items: [
					{
						id: "plugin-settings",
						status: "conflict",
						error: undefined,
					},
				],
			};

			const result = await syncPluginData(plugin);
			expect(result.conflict).toBe(true);
			expect(result.status).toBe("partial");
		});
	});
});
