import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginDataManager, extractSettings, mergeSettings } from "../PluginDataManager";
import { DEFAULT_SETTINGS, type ObsidianAISettings, type SyncComponentConfig } from "../../settings";

function createMockPlugin(settings: Partial<ObsidianAISettings> = {}): any {
	return {
		manifest: { version: "1.3.5" },
		settings: {
			...DEFAULT_SETTINGS,
			...settings,
			providerProfiles: settings.providerProfiles ?? [
				{ id: "p1", name: "OpenAI", apiKey: "sk-secret", provider: "openai", model: "gpt-4", createdAt: 0, updatedAt: 0 },
				{ id: "p2", name: "Local", apiKey: "", provider: "ollama", model: "llama2", createdAt: 0, updatedAt: 0 },
			],
		},
		syncEngine: null,
	};
}

describe("PluginDataManager", () => {
	describe("createExportBundle", () => {
		it("includes all settings when secrets enabled", () => {
			const plugin = createMockPlugin();
			const manager = new PluginDataManager(plugin);
			const bundle = manager.createExportBundle(true);

			expect(bundle.schemaVersion).toBe(1);
			expect(bundle.settings.providerProfiles[0].apiKey).toBe("sk-secret");
		});

		it("redacts secrets by default", () => {
			const plugin = createMockPlugin();
			const manager = new PluginDataManager(plugin);
			const bundle = manager.createExportBundle(false);

			expect(bundle.settings.providerProfiles[0].apiKey).toBe("REDACTED");
		});

		it("filters by syncComponents", () => {
			const plugin = createMockPlugin({
				syncComponents: {
					...DEFAULT_SETTINGS.syncComponents,
					pluginSettings: false,
				},
			});
			const manager = new PluginDataManager(plugin);
			const bundle = manager.createExportBundle(true);

			expect(bundle.settings.selectionPrompt).toBe("");
			expect(bundle.settings.providerProfiles).toEqual([]);
		});
	});

	describe("createSyncBundle", () => {
		it("includes settings when pluginSettings enabled", () => {
			const plugin = createMockPlugin();
			const manager = new PluginDataManager(plugin);
			const bundle = manager.createSyncBundle();

			expect(bundle.version).toBe(1);
			expect(bundle.settings).toBeDefined();
		});

		it("strips API keys when apiKeys disabled", () => {
			const plugin = createMockPlugin({
				syncComponents: {
					...DEFAULT_SETTINGS.syncComponents,
					apiKeys: false,
				},
			});
			const manager = new PluginDataManager(plugin);
			const bundle = manager.createSyncBundle();

			expect(bundle.settings!.providerProfiles![0].apiKey).toBe("");
		});
	});

	describe("validateImport", () => {
		const manager = new PluginDataManager(createMockPlugin());

		it("accepts valid export bundle", () => {
			const result = manager.validateImport({
				schemaVersion: 1,
				settings: {},
			});
			expect(result.valid).toBe(true);
		});

		it("rejects missing schemaVersion", () => {
			const result = manager.validateImport({ settings: {} });
			expect(result.valid).toBe(false);
		});

		it("rejects future schemaVersion", () => {
			const result = manager.validateImport({
				schemaVersion: 99,
				settings: {},
			});
			expect(result.valid).toBe(false);
		});
	});

	describe("mergeSettings", () => {
		it("merges profiles by ID", () => {
			const current = createMockPlugin().settings;
			const imported: Partial<ObsidianAISettings> = {
				providerProfiles: [
					{ id: "p1", name: "Updated", apiKey: "new-key", provider: "openai" },
				],
			};

			const result = mergeSettings(current, imported);
			expect(result.providerProfiles[0].name).toBe("Updated");
		});

		it("preserves local credentials by default", () => {
			const current = createMockPlugin().settings;
			const imported: Partial<ObsidianAISettings> = {
				providerProfiles: [
					{ id: "p1", name: "Updated", apiKey: "", provider: "openai" },
				],
			};

			const result = mergeSettings(current, imported, { preserveCredentials: true });
			expect(result.providerProfiles[0].apiKey).toBe("sk-secret");
		});

		it("preserves remote storage credentials", () => {
			const current = createMockPlugin().settings;
			current.remoteStorage.webdav = { url: "local", username: "me", password: "secret" };

			const imported: Partial<ObsidianAISettings> = {
				remoteStorage: { enabled: true, backend: "webdav", webdav: { url: "remote" } },
			};

			const result = mergeSettings(current, imported, { preserveRemoteStorage: true });
			expect(result.remoteStorage.webdav.password).toBe("secret");
		});
	});

	describe("extractSettings", () => {
		it("zeros out plugin settings when disabled", () => {
			const plugin = createMockPlugin({
				selectionPrompt: "custom prompt",
			});
			const components: SyncComponentConfig = {
				...DEFAULT_SETTINGS.syncComponents,
				pluginSettings: false,
			};

			const result = extractSettings(plugin, components, true, "export");
			expect(result.selectionPrompt).toBe("");
		});

		it("strips API keys when apiKeys disabled in sync mode", () => {
			const plugin = createMockPlugin();
			const components: SyncComponentConfig = {
				...DEFAULT_SETTINGS.syncComponents,
				apiKeys: false,
			};

			const result = extractSettings(plugin, components, true, "sync");
			expect(result.providerProfiles![0].apiKey).toBe("");
		});

		it("keeps API keys in export mode when includeSecrets true", () => {
			const plugin = createMockPlugin();
			const components: SyncComponentConfig = {
				...DEFAULT_SETTINGS.syncComponents,
				apiKeys: false,
			};

			const result = extractSettings(plugin, components, true, "export");
			expect(result.providerProfiles![0].apiKey).toBe("sk-secret");
		});
	});
});
