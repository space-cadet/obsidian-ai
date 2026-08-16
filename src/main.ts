// main.ts
import { Plugin, MarkdownView, App, Notice, WorkspaceLeaf } from "obsidian";
import { EditorView } from "@codemirror/view";
import {
	ObsidianAISettings,
	DEFAULT_SETTINGS,
	normalizeSettings,
} from "./settings";
import { ObsidianAISettingsTab } from "./settings-sections/SettingsTab";
import {
	acceptTooltipEffect,
	commandEffect,
	dismissTooltipEffect,
	FloatingTooltipExtension,
} from "./modules/WidgetExtension";
import { ChatApiManager } from "./api";
import { generatedResponseState } from "./modules/AIExtension";
import {
	buildSelectionHiglightState,
	currentSelectionState,
	setSelectionInfoEffect,
} from "./modules/SelectionState";
import { diffExtension } from "./modules/diffExtension";
import { ObsidianAIChatView, CHAT_VIEWTYPE } from "./views/ObsidianAIChatView";
import { PluginUpdater, UpdateAvailableModal } from "./updater/PluginUpdater";
import { GIT_COMMIT_HASH, GIT_BRANCH } from "./version-info";
import { StoredChatData, ChatSession } from "./types";
import { createFileLogger, FileLogger } from "./logger";
import { createStorage, ChatStorage, StorageDeps } from "./storage/ChatStorage";
import { ChatStorageMigration } from "./storage/Migration";
import { MigrationPromptModal } from "./modals/MigrationPromptModal";

import { AgentApiManager } from "./api/AgentApiManager";

import { SessionStorage } from "./storage/session-storage";
import { PersonaLoader } from "./intelligence/PersonaLoader";
import { SearchIndex } from "./search/index";
import { SessionSummarizer } from "./intelligence/SessionSummarizer";
import { SyncEngine } from "./sync/SyncEngine";
import { LocalCache } from "./sync/LocalCache";
import { EncryptionLayer } from "./sync/EncryptionLayer";
import { WebDAVStorageAdapter } from "./sync/WebDAVStorageAdapter";
import { ProviderRegistry } from "./integrations/ProviderRegistry";

export const OPEN_CHAT_COMMAND_ID = "open-chat-lab-sidebar";
export const OPEN_CHAT_COMMAND_NAME = "Open Chat Lab AI sidebar";

export default class ObsidianAIPlugin extends Plugin {
	private static readonly LEGACY_PLUGIN_ID = "obsidian-ai";
	settings: ObsidianAISettings = DEFAULT_SETTINGS;
	chatapi!: ChatApiManager;
	agentapi: AgentApiManager | null = null;
	logger!: FileLogger;
	sessionStorage: SessionStorage | null = null;
	personaLoader: PersonaLoader | null = null;
	searchIndex: SearchIndex | null = null;
	sessionSummarizer: SessionSummarizer | null = null;
	integrationRegistry!: ProviderRegistry;
	syncEngine: SyncEngine | null = null;

	// Data integrity guards
	private _backupCreated = false;
	private _settingsLoadedFromFile = false;
	private _saveInProgress = false;
	private _pendingChatData: StoredChatData | null = null;
	private _chatStorage: ChatStorage | null = null;
	private _migrationPromptShown = false;
	private _chatViewActivation: Promise<void> | null = null;
	private _updater: PluginUpdater | null = null;

	async onload() {
		// Register the entry command before asynchronous migration/settings work so
		// Obsidian's command palette can discover it even while startup completes.
		this.addCommand({
			id: OPEN_CHAT_COMMAND_ID,
			name: OPEN_CHAT_COMMAND_NAME,
			callback: () => this.activateChatView(),
		});

		await this._migrateLegacyPluginData();
		// Initialize file logger FIRST so any crash during load is captured.
		this.logger = createFileLogger(this.app, this.manifest.id);
		await this.logger.init();

		await this.loadSettings();
		this.integrationRegistry = new ProviderRegistry(
			this.app,
			this.settings,
		);
		this.integrationRegistry.discover();
		this.logger.setMaxSize(this.settings.debugLogMaxSizeMB * 1024 * 1024);
		this.chatapi = new ChatApiManager(this.settings, this.app);

		// Initialize low-level session storage
		this.sessionStorage = new SessionStorage({
			app: this.app,
			manifest: this.manifest,
			logger: this.logger,
		});

		// Initialize intelligence layer (T26)
		this.personaLoader = new PersonaLoader({
			app: this.app,
			manifest: this.manifest,
			logger: this.logger,
		});
		this.searchIndex = new SearchIndex(this.app, this.manifest.id);
		if (this.settings.intelligence?.enableIntelligence) {
			await this.personaLoader.ensureDefaults();
		}

		// Initialize session summarizer (T26 Phase 2)
		this.sessionSummarizer = new SessionSummarizer(
			this.personaLoader,
			this.chatapi,
		);

		// Initialize chat storage layer
		this._chatStorage = createStorage(
			this._storageDeps(),
			this.settings.chatStorageFormat,
		);

		// Detect legacy format and prompt for migration (non-blocking, once per session)
		if (this.settings.chatStorageFormat === "legacy") {
			const hasLegacy = await this._chatStorage.detectLegacyFormat();
			if (hasLegacy && !this._migrationPromptShown) {
				this._migrationPromptShown = true;
				const migration = new ChatStorageMigration(this._storageDeps());
				new MigrationPromptModal(
					this.app,
					migration,
					async () => {
						// On migrate: switch to jsonl format and reinitialize storage
						this.settings.chatStorageFormat = "jsonl";
						this._chatStorage = createStorage(
							this._storageDeps(),
							"jsonl",
						);
						await this.saveSettings();
					},
					() => {
						// On keep legacy: do nothing, user can migrate later
					},
					() => {
						// On remind later: do nothing, will prompt again next session
					},
				).open();
			}
		}

		this.registerView(
			CHAT_VIEWTYPE,
			(leaf) => new ObsidianAIChatView(leaf, this, {}),
		);

		// A previous desktop race could have persisted more than one chat leaf in
		// the workspace. Reconcile restored layouts once they are fully available.
		this.app.workspace.onLayoutReady(() => {
			this.integrationRegistry.discover();
			this.removeDuplicateChatLeaves();
		});

		this.addRibbonIcon("message-square", "Open Chat Lab", () => {
			this.activateChatView();
		});

		this.addCommand({
			id: "open-obsidian-ai-chat",
			name: "Open Chat Lab",
			callback: () => this.activateChatView(),
		});

		this.registerEditorExtension([
			FloatingTooltipExtension(this.chatapi, this),
			generatedResponseState,
			currentSelectionState,
			buildSelectionHiglightState,
			diffExtension,
		]);

		// Add command to show tooltip
		this.addCommand({
			id: "show-cursor-tooltip",
			name: "Show cursor tooltip",
			callback: () => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any)
						.cm as EditorView;

					// Grab the main selection range
					const { from, to } = cmEditor.state.selection.main;
					const effects = [];

					if (from !== to) {
						// If there is a real selection, store it
						const selectedText = cmEditor.state.doc.sliceString(
							from,
							to,
						);
						effects.push(
							setSelectionInfoEffect.of({
								from,
								to,
								text: selectedText,
							}),
						);
					} else {
						// If no selection, store cursor position instead of null
						effects.push(
							setSelectionInfoEffect.of({ from, to, text: "" }),
						);
					}

					// Also trigger the overlay
					effects.push(commandEffect.of(null));

					// Dispatch all effects in one go
					cmEditor.dispatch({ effects });
				}
			},
			hotkeys: [],
		});
		this.addCommand({
			id: "accept-tooltip",
			name: "Accept tooltip suggestion",
			callback: () => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any)
						.cm as EditorView;

					const response = cmEditor.state.field(
						generatedResponseState,
						false,
					);
					if (response) {
						cmEditor.dispatch({
							effects: acceptTooltipEffect.of(null),
						});
						cmEditor.dispatch({
							effects: dismissTooltipEffect.of(null),
						});
					}
				}
			},
		});
		this.addCommand({
			id: "discard-tooltip",
			name: "Discard tooltip suggestion",
			callback: () => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					const cmEditor = (markdownView.editor as any)
						.cm as EditorView;
					const response = cmEditor.state.field(
						generatedResponseState,
						false,
					);
					if (response) {
						cmEditor.dispatch({
							effects: dismissTooltipEffect.of(null),
						});
					}
				}
			},
		});

		// Initialize auto-updater
		this._updater = new PluginUpdater(this.app, this.manifest.id);

		// Add manual update check command
		this.addCommand({
			id: "check-for-updates",
			name: "Check for updates",
			callback: () => this.checkForUpdates(true),
		});

		// Auto-check on startup (if enabled and not checked recently)
		if (this.settings.checkForUpdates) {
			const oneDay = 24 * 60 * 60 * 1000;
			const lastCheck = this.settings.lastUpdateCheck ?? 0;
			if (Date.now() - lastCheck > oneDay) {
				this.checkForUpdates(false);
			}
		}

		// Add settings tab
		this.addSettingTab(new ObsidianAISettingsTab(this.app, this));

		// Initialize remote sync engine if configured
		await this._initSyncEngine();

		// Command to clear debug log
		this.addCommand({
			id: "clear-debug-log",
			name: "Clear debug log file",
			callback: async () => {
				await this.logger.clear();
				new Notice("Debug log cleared.");
			},
		});
	}

	/**
	 * Preserve existing installations when the technical plugin ID changes.
	 * The legacy directory is intentionally retained as a rollback backup.
	 */
	private async _migrateLegacyPluginData(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const configDir = this.app.vault.configDir;
		const legacyDir = `${configDir}/plugins/${ObsidianAIPlugin.LEGACY_PLUGIN_ID}`;
		const currentDir = `${configDir}/plugins/${this.manifest.id}`;

		if (this.manifest.id === ObsidianAIPlugin.LEGACY_PLUGIN_ID) return;
		if (
			!(await adapter.exists(legacyDir)) ||
			(await adapter.exists(currentDir))
		)
			return;

		try {
			await adapter.mkdir(currentDir);
			const copyTree = async (
				sourceDir: string,
				destinationDir: string,
			): Promise<void> => {
				const listing = await adapter.list(sourceDir);
				for (const folder of listing.folders) {
					const relative = folder
						.slice(sourceDir.length)
						.replace(/^\//, "");
					const target = `${destinationDir}/${relative}`;
					await adapter.mkdir(target).catch(() => undefined);
					await copyTree(folder, target);
				}
				for (const file of listing.files) {
					const relative = file
						.slice(sourceDir.length)
						.replace(/^\//, "");
					await adapter.write(
						`${destinationDir}/${relative}`,
						await adapter.read(file),
					);
				}
			};
			await copyTree(legacyDir, currentDir);
			this.logger?.log(
				"info",
				`Migrated plugin data from ${legacyDir} to ${currentDir}`,
			);
		} catch (error) {
			this.logger?.log("error", `Plugin data migration failed: ${error}`);
			throw new Error(
				`Could not migrate existing Obsidian AI data: ${error}`,
			);
		}
	}

	async activateChatView() {
		if (this._chatViewActivation) {
			return this._chatViewActivation;
		}

		const activation = this.activateChatViewOnce();
		this._chatViewActivation = activation;

		try {
			await activation;
		} finally {
			if (this._chatViewActivation === activation) {
				this._chatViewActivation = null;
			}
		}
	}

	private async activateChatViewOnce(): Promise<void> {
		const { workspace } = this.app;
		let leaf = this.removeDuplicateChatLeaves();
		if (!leaf) {
			// Defensive: workspace restoration may still be in progress,
			// so the restored leaf might not yet appear in getLeavesOfType.
			// Wait one animation frame before falling back to creating a new leaf.
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			);
			leaf = this.removeDuplicateChatLeaves();
		}
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: CHAT_VIEWTYPE, active: true });
		}
		workspace.setActiveLeaf(leaf, { focus: true });
	}

	/** Keep the focused chat leaf when possible and remove stale duplicate leaves. */
	private removeDuplicateChatLeaves(): WorkspaceLeaf | undefined {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(CHAT_VIEWTYPE);
		if (leaves.length === 0) return undefined;

		const activeLeaf = workspace.activeLeaf;
		const canonicalLeaf =
			activeLeaf && leaves.includes(activeLeaf) ? activeLeaf : leaves[0];

		for (const leaf of leaves) {
			if (leaf !== canonicalLeaf) {
				leaf.detach();
			}
		}

		return canonicalLeaf;
	}

	async openSessionInNewTab(
		sessionId: string,
		messageId: string,
	): Promise<void> {
		// Session tabs are managed inside the existing chat view so the toolbar and
		// composer stay shared rather than creating stacked sidebar leaves.
		window.dispatchEvent(
			new CustomEvent("obsidian-ai:open-session", {
				detail: { sessionId, messageId },
			}),
		);
	}

	/**
	 * Called when a chat session ends (e.g. user creates a new session).
	 * If auto-summarize is enabled, extracts key points and saves to memory.
	 */
	async onSessionEnd(session: ChatSession): Promise<void> {
		if (!this.settings.intelligence?.autoSummarize) return;
		if (!this.sessionSummarizer) return;
		if (!this.settings.intelligence?.enableIntelligence) return;

		const minMessages =
			this.settings.intelligence.autoSummarizeMinMessages ?? 4;
		if (
			!this.sessionSummarizer.shouldSummarize(
				session.messages,
				minMessages,
			)
		) {
			return;
		}

		const activeProfile =
			this.settings.providerProfiles.find(
				(p) =>
					p.id ===
					(session.profileId ||
						this.settings.activeProviderProfileId),
			) || this.settings.providerProfiles[0];

		if (!activeProfile) return;

		this.logger?.log(
			"info",
			`[onSessionEnd] Summarizing session ${session.id}`,
		);
		try {
			const entries = await this.sessionSummarizer.summarizeSession(
				session.id,
				session.messages,
				activeProfile,
				{ minMessages },
			);
			this.logger?.log(
				"info",
				`[onSessionEnd] Saved ${entries.length} memory entries`,
			);
		} catch (e) {
			this.logger?.log(
				"warn",
				`[onSessionEnd] Summarization failed: ${e}`,
			);
		}
	}

	async checkForUpdates(manual: boolean) {
		if (!this._updater) return;

		try {
			const result = await this._updater.checkForUpdate(
				this.manifest.version,
				this.settings.updateChannel === "dev",
				GIT_COMMIT_HASH,
				GIT_BRANCH,
			);

			this.settings.lastUpdateCheck = Date.now();
			await this.saveSettings();

			if (!result.hasUpdate) {
				if (manual) {
					new Notice(
						`✅ Chat Lab is up to date (${result.currentVersion})`,
					);
				}
				return;
			}

			if (this.settings.autoUpdate && !result.isPrerelease) {
				// Auto-install stable updates
				new Notice(`📦 Downloading update ${result.latestVersion}…`);
				const tempDir = await this._updater.downloadUpdate(
					result.release!,
				);
				await this._updater.installUpdate(tempDir);
				new Notice(
					`✅ Update ${result.latestVersion} installed. Reload to apply.`,
				);
			} else {
				// Show modal for manual confirmation
				const modal = new UpdateAvailableModal(
					this.app,
					result,
					async () => {
						const tempDir = await this._updater!.downloadUpdate(
							result.release!,
						);
						await this._updater!.installUpdate(tempDir);
					},
				);
				modal.open();
			}
		} catch (error: any) {
			console.error("[ObsidianAI] Update check failed:", error);
			if (manual) {
				new Notice(`❌ Update check failed: ${error.message}`);
			}
		}
	}

	onunload() {
		this.logger.stopMemoryLogging();
		this.logger.flushNow();
	}

	/** Initialize SyncEngine for remote storage sync */
	private async _initSyncEngine(): Promise<void> {
		const rs = this.settings.remoteStorage;
		if (!rs.enabled || rs.backend === "none") return;

		try {
			const adapter = new WebDAVStorageAdapter();
			const cache = new LocalCache();
			const crypto = new EncryptionLayer();

			this.syncEngine = new SyncEngine({
				adapter,
				cache,
				crypto,
				passphrase: rs.passphrase,
				conflictStrategy: rs.conflictStrategy,
				logger: {
					log: (level: string, msg: string) => {
						this.logger?.log(level as any, `[SyncEngine] ${msg}`);
					},
				},
			});

			if (rs.backend === "webdav" && rs.webdav) {
				await this.syncEngine.initialize({
					url: rs.webdav.url,
					username: rs.webdav.username,
					password: rs.webdav.password,
					prefix: rs.webdav.prefix,
				});
				this.logger?.log("info", "SyncEngine initialized (WebDAV)");
			}
			// TODO: S3 and custom backends
		} catch (err: any) {
			this.logger?.log("error", `SyncEngine init failed: ${err.message}`);
			console.error("[ObsidianAI] SyncEngine init failed:", err);
		}
	}

	/** Trigger a manual sync and update settings */
	async triggerSync(): Promise<{ ok: boolean; message: string }> {
		if (!this.syncEngine) {
			return { ok: false, message: "Sync not configured. Check Remote Storage settings." };
		}

		try {
			const result = await this.syncEngine.sync();
			this.settings.remoteStorage.lastSyncTime = Date.now();
			await this.saveSettings();

			const parts: string[] = [];
			if (result.uploaded > 0) parts.push(`↑${result.uploaded}`);
			if (result.downloaded > 0) parts.push(`↓${result.downloaded}`);
			if (result.conflicts > 0) parts.push(`⚡${result.conflicts}`);
			if (result.errors.length > 0) parts.push(`⊘${result.errors.length}`);

			const msg = parts.length > 0 ? parts.join(" ") : "Nothing to sync";
			return { ok: result.errors.length === 0, message: msg };
		} catch (err: any) {
			return { ok: false, message: `Sync failed: ${err.message}` };
		}
	}
	private _storageDeps(): StorageDeps {
		return {
			app: this.app,
			manifest: this.manifest,
			settings: this.settings,
			loadData: () => this.loadData(),
			saveData: (data) => this.saveData(data),
			logger: this.logger,
		};
	}

	// ─────────────────────────────────────────────────────────────
	// Safe data persistence layer
	// ─────────────────────────────────────────────────────────────

	async loadSettings() {
		this.logger?.log("info", "loadSettings: reading data.json");
		const raw = await this.loadData();
		this._settingsLoadedFromFile = raw !== null && typeof raw === "object";
		this.logger?.log(
			"info",
			`loadSettings: _settingsLoadedFromFile=${this._settingsLoadedFromFile}, raw=${raw ? "exists" : "null"}`,
		);
		this.settings = normalizeSettings(raw);
		this.logger?.setMaxSize(this.settings.debugLogMaxSizeMB * 1024 * 1024);
	}

	async saveSettings() {
		this.logger?.log(
			"info",
			`saveSettings called: _settingsLoadedFromFile=${this._settingsLoadedFromFile}`,
		);

		// Guard: don't overwrite with defaults if we never successfully loaded user data.
		if (!this._settingsLoadedFromFile) {
			this.logger?.log(
				"warn",
				"saveSettings blocked: no valid data.json was loaded; refusing to overwrite with defaults",
			);
			return;
		}

		const existing = (await this.loadData()) ?? {};
		let payload: Record<string, any> = { ...existing, ...this.settings };

		// When using JSONL storage, strip legacy chat data keys from data.json
		// to avoid accidentally re-introducing legacy format after migration
		if (this.settings.chatStorageFormat === "jsonl") {
			delete payload.chatData;
			delete payload.chatMessages;
		}

		// Skip write if nothing changed
		if (JSON.stringify(payload) === JSON.stringify(existing)) {
			this.logger?.log("info", "saveSettings skipped: no changes");
			return;
		}

		this.logger?.log("info", "saveSettings: writing data.json to disk");
		await this._ensureRollingBackup(existing);
		await this.saveData(payload);
		this.logger?.log(
			"info",
			"saveSettings: data.json written successfully",
		);
	}

	async loadChatData(): Promise<StoredChatData> {
		this.logger?.log("info", "loadChatData: delegating to storage layer");
		if (!this._chatStorage) {
			this._chatStorage = createStorage(
				this._storageDeps(),
				this.settings.chatStorageFormat,
			);
		}
		return this._chatStorage.loadChatData();
	}

	async saveChatData(chatData: StoredChatData): Promise<void> {
		if (!this._chatStorage) {
			this._chatStorage = createStorage(
				this._storageDeps(),
				this.settings.chatStorageFormat,
			);
		}
		if (this._saveInProgress) {
			this._pendingChatData = chatData;
			this.logger?.log(
				"info",
				"saveChatData queued: save already in progress",
			);
			return;
		}
		this._saveInProgress = true;

		try {
			let nextChatData: StoredChatData | null = chatData;
			while (nextChatData) {
				this._pendingChatData = null;
				this.logger?.log(
					"info",
					"saveChatData: writing via storage layer",
				);
				await this._chatStorage.saveChatData(nextChatData);
				this.logger?.log(
					"info",
					"saveChatData: storage layer wrote successfully",
				);

				// Invalidate search index so next search picks up new messages
				this.searchIndex?.invalidate();

				nextChatData = this._pendingChatData;
				if (nextChatData) {
					this.logger?.log(
						"info",
						"saveChatData: flushing queued snapshot",
					);
				}
			}
		} finally {
			this._saveInProgress = false;
		}
	}

	/** Create rolling backups of data.json before writes */
	private async _ensureRollingBackup(currentData: unknown): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const pluginDir = `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
			const dataPath = `${pluginDir}/data.json`;
			const backupCount = this.settings.sessionBackupCount ?? 3;

			const exists = await adapter.exists(dataPath);
			if (!exists) return;

			const content = await adapter.read(dataPath);

			// Rotate existing backups: .bak.2 -> .bak.3, .bak.1 -> .bak.2, .bak -> .bak.1
			for (let i = backupCount - 1; i >= 1; i--) {
				const src =
					i === 1 ? `${dataPath}.bak` : `${dataPath}.bak.${i - 1}`;
				const dst = `${dataPath}.bak.${i}`;
				if (await adapter.exists(src)) {
					await adapter.write(dst, await adapter.read(src));
				}
			}

			// Write the new .bak
			await adapter.write(`${dataPath}.bak`, content);
			this.logger?.log(
				"info",
				`Rolling backup created for data.json (keeping ${backupCount} copies)`,
			);
		} catch (e) {
			this.logger?.log("warn", `Failed to create rolling backup: ${e}`);
		}
	}
}
