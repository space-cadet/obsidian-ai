import { Notice } from "obsidian";
import ObsidianAIPlugin from "../main";
import { WebDAVStorageAdapter } from "../sync/WebDAVStorageAdapter";

/** Test WebDAV connection */
async function testWebDAVConnection(
	url: string,
	username: string,
	password: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const adapter = new WebDAVStorageAdapter();
		await adapter.initialize({
			url,
			username,
			password,
			prefix: "obsidian-ai-sync/",
			timeout: 10000,
		});
		await adapter.disconnect();
		return { ok: true };
	} catch (err: any) {
		return { ok: false, error: err.message };
	}
}

/** Render the Remote Storage settings section */
export function renderRemoteStorageSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (opts?: { quiet?: boolean }) => Promise<void>,
): void {
	const section = containerEl.createEl("div", {
		cls: "obsidian-ai-settings-section",
		attr: { id: "obsidian-ai-settings-remote-storage" },
	});

	section.createEl("h2", { text: "Remote Storage" });

	const desc = section.createEl("p", { cls: "setting-item-description" });
	desc.textContent =
		"Sync your chat sessions to remote storage for cross-device access and backup. " +
		"All data is encrypted end-to-end before leaving your device.";

	// ── Enable toggle ──
	const enableRow = section.createEl("div", { cls: "setting-item" });
	enableRow.createEl("div", {
		cls: "setting-item-info",
		childNodes: [
			enableRow.createEl("div", { text: "Enable Remote Storage" }),
			enableRow.createEl("div", {
				cls: "setting-item-description",
				text: "Turn on to sync chat sessions to a remote backend.",
			}),
		] as Node[],
	});
	const enableControl = enableRow.createEl("div", {
		cls: "setting-item-control",
	});
	const enableToggle = enableControl.createEl("input", {
		type: "checkbox",
	});
	enableToggle.checked = plugin.settings.remoteStorage.enabled;
	enableToggle.addEventListener("change", async () => {
		plugin.settings.remoteStorage.enabled = enableToggle.checked;
		await saveSettings({ quiet: true });
		updateVisibility();
	});

	// ── Backend selector ──
	const backendRow = section.createEl("div", { cls: "setting-item" });
	backendRow.createEl("div", { cls: "setting-item-info", text: "Storage Backend" });
	const backendControl = backendRow.createEl("div", {
		cls: "setting-item-control",
	});
	const backendSelect = backendControl.createEl("select", { cls: "dropdown" });
	const backends: Array<{ value: string; label: string }> = [
		{ value: "none", label: "— Select backend —" },
		{ value: "webdav", label: "WebDAV (Nextcloud, ownCloud, generic)" },
		{ value: "s3", label: "S3-compatible (AWS, MinIO, Backblaze) — coming soon" },
		{ value: "custom", label: "Custom REST API — coming soon" },
	];
	for (const { value, label } of backends) {
		backendSelect.createEl("option", { text: label, value });
	}
	backendSelect.value = plugin.settings.remoteStorage.backend;
	backendSelect.addEventListener("change", async () => {
		plugin.settings.remoteStorage.backend = backendSelect.value as any;
		await saveSettings({ quiet: true });
		updateVisibility();
	});

	// ── Passphrase ──
	const passphraseRow = section.createEl("div", { cls: "setting-item" });
	passphraseRow.createEl("div", {
		cls: "setting-item-info",
		childNodes: [
			passphraseRow.createEl("div", { text: "Encryption Passphrase" }),
			passphraseRow.createEl("div", {
				cls: "setting-item-description",
				text: "Used to encrypt/decrypt your data. Never stored on the server. Required on every device.",
			}),
		] as Node[],
	});
	const passphraseControl = passphraseRow.createEl("div", {
		cls: "setting-item-control",
	});
	const passphraseInput = passphraseControl.createEl("input", {
		type: "password",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.remoteStorage.passphrase,
		placeholder: "Enter a strong passphrase",
	});
	passphraseInput.setCssStyles({ minWidth: "200px" });
	passphraseInput.addEventListener("change", async () => {
		plugin.settings.remoteStorage.passphrase = passphraseInput.value;
		await saveSettings({ quiet: true });
	});

	// ── Auto-sync toggle ──
	const autoSyncRow = section.createEl("div", { cls: "setting-item" });
	autoSyncRow.createEl("div", {
		cls: "setting-item-info",
		text: "Auto-sync",
	});
	autoSyncRow.createEl("div", {
		cls: "setting-item-description",
		text: "Automatically sync when sessions change.",
	});
	const autoSyncControl = autoSyncRow.createEl("div", {
		cls: "setting-item-control",
	});
	const autoSyncToggle = autoSyncControl.createEl("input", {
		type: "checkbox",
	});
	autoSyncToggle.checked = plugin.settings.remoteStorage.autoSync;
	autoSyncToggle.addEventListener("change", async () => {
		plugin.settings.remoteStorage.autoSync = autoSyncToggle.checked;
		await saveSettings({ quiet: true });
	});

	// ── Conflict strategy ──
	const conflictRow = section.createEl("div", { cls: "setting-item" });
	conflictRow.createEl("div", { cls: "setting-item-info", text: "Conflict Resolution" });
	const conflictControl = conflictRow.createEl("div", {
		cls: "setting-item-control",
	});
	const conflictSelect = conflictControl.createEl("select", { cls: "dropdown" });
	const strategies = [
		{ value: "last-write-wins", label: "Last write wins" },
		{ value: "keep-both", label: "Keep both copies" },
		{ value: "manual", label: "Manual resolution" },
	];
	for (const { value, label } of strategies) {
		conflictSelect.createEl("option", { text: label, value });
	}
	conflictSelect.value = plugin.settings.remoteStorage.conflictStrategy;
	conflictSelect.addEventListener("change", async () => {
		plugin.settings.remoteStorage.conflictStrategy = conflictSelect.value as any;
		await saveSettings({ quiet: true });
	});

	// ═══════════════════════════════════════════════════
	// WebDAV-specific settings
	// ═══════════════════════════════════════════════════
	const webdavSection = section.createEl("div", {
		cls: "obsidian-ai-webdav-settings",
	});

	webdavSection.createEl("h3", { text: "WebDAV Configuration" });

	// URL
	const urlRow = webdavSection.createEl("div", { cls: "setting-item" });
	urlRow.createEl("div", { cls: "setting-item-info", text: "WebDAV URL" });
	const urlControl = urlRow.createEl("div", { cls: "setting-item-control" });
	const urlInput = urlControl.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.remoteStorage.webdav?.url ?? "",
		placeholder: "https://nextcloud.example.com/remote.php/dav/files/username/",
	});
	urlInput.setCssStyles({ minWidth: "300px" });
	urlInput.addEventListener("change", async () => {
		plugin.settings.remoteStorage.webdav ??= {
			type: "webdav",
			url: "",
			username: "",
			password: "",
			prefix: "obsidian-ai-sync/",
			enabled: false,
		};
		plugin.settings.remoteStorage.webdav.url = urlInput.value.trim();
		await saveSettings({ quiet: true });
	});

	// Username
	const userRow = webdavSection.createEl("div", { cls: "setting-item" });
	userRow.createEl("div", { cls: "setting-item-info", text: "Username" });
	const userControl = userRow.createEl("div", { cls: "setting-item-control" });
	const userInput = userControl.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.remoteStorage.webdav?.username ?? "",
		placeholder: "Username",
	});
	userInput.addEventListener("change", async () => {
		plugin.settings.remoteStorage.webdav ??= {
			type: "webdav",
			url: "",
			username: "",
			password: "",
			prefix: "obsidian-ai-sync/",
			enabled: false,
		};
		plugin.settings.remoteStorage.webdav.username = userInput.value.trim();
		await saveSettings({ quiet: true });
	});

	// Password
	const passRow = webdavSection.createEl("div", { cls: "setting-item" });
	passRow.createEl("div", { cls: "setting-item-info", text: "Password / App Token" });
	const passControl = passRow.createEl("div", { cls: "setting-item-control" });
	const passInput = passControl.createEl("input", {
		type: "password",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.remoteStorage.webdav?.password ?? "",
		placeholder: "Password or app-specific token",
	});
	passInput.addEventListener("change", async () => {
		plugin.settings.remoteStorage.webdav ??= {
			type: "webdav",
			url: "",
			username: "",
			password: "",
			prefix: "obsidian-ai-sync/",
			enabled: false,
		};
		plugin.settings.remoteStorage.webdav.password = passInput.value;
		await saveSettings({ quiet: true });
	});

	// Prefix
	const prefixRow = webdavSection.createEl("div", { cls: "setting-item" });
	prefixRow.createEl("div", {
		cls: "setting-item-info",
		childNodes: [
			prefixRow.createEl("div", { text: "Path Prefix" }),
			prefixRow.createEl("div", {
				cls: "setting-item-description",
				text: "Directory under which sessions are stored.",
			}),
		] as Node[],
	});
	const prefixControl = prefixRow.createEl("div", { cls: "setting-item-control" });
	const prefixInput = prefixControl.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.remoteStorage.webdav?.prefix ?? "obsidian-ai-sync/",
	});
	prefixInput.addEventListener("change", async () => {
		plugin.settings.remoteStorage.webdav ??= {
			type: "webdav",
			url: "",
			username: "",
			password: "",
			prefix: "obsidian-ai-sync/",
			enabled: false,
		};
		plugin.settings.remoteStorage.webdav.prefix = prefixInput.value.trim() || "obsidian-ai-sync/";
		await saveSettings({ quiet: true });
	});

	// ── Test + Save buttons ──
	const btnRow = webdavSection.createEl("div", { cls: "setting-item" });
	btnRow.setCssStyles({ borderTop: "none", paddingTop: "0" });
	const btnControl = btnRow.createEl("div", { cls: "setting-item-control" });
	btnControl.setCssStyles({ display: "flex", gap: "8px" });

	const testBtn = btnControl.createEl("button", {
		text: "🧪 Test Connection",
		cls: "mod-cta",
	});

	testBtn.addEventListener("click", async () => {
		testBtn.disabled = true;
		testBtn.textContent = "Testing…";
		const result = await testWebDAVConnection(
			urlInput.value.trim(),
			userInput.value.trim(),
			passInput.value,
		);
		testBtn.disabled = false;
		testBtn.textContent = "🧪 Test Connection";

		if (result.ok) {
			new Notice("✅ WebDAV connection successful!");
			plugin.settings.remoteStorage.webdav ??= {
				type: "webdav",
				url: "",
				username: "",
				password: "",
				prefix: "obsidian-ai-sync/",
				enabled: false,
			};
			plugin.settings.remoteStorage.webdav.enabled = true;
			await saveSettings({ quiet: true });
		} else {
			new Notice(`❌ WebDAV connection failed: ${result.error}`);
		}
	});

	// ── Manual sync button ──
	const syncBtn = btnControl.createEl("button", {
		text: "🔄 Sync Now",
		cls: "mod-cta",
	});
	syncBtn.setCssStyles({ backgroundColor: "var(--interactive-accent)" });

	syncBtn.addEventListener("click", async () => {
		if (!plugin.settings.remoteStorage.enabled) {
			new Notice("Enable remote storage first.");
			return;
		}
		if (!plugin.settings.remoteStorage.passphrase) {
			new Notice("Enter an encryption passphrase first.");
			return;
		}
		// TODO: Trigger sync via plugin.syncEngine.sync()
		new Notice("Sync triggered — not yet wired to engine.");
	});

	// ── Last sync info ──
	const infoRow = section.createEl("div", { cls: "setting-item" });
	infoRow.setCssStyles({ borderTop: "none", paddingTop: "0" });
	const infoEl = infoRow.createEl("div", {
		cls: "setting-item-description",
	});
	function updateInfo() {
		const lastSync = plugin.settings.remoteStorage.lastSyncTime;
		if (lastSync > 0) {
			const date = new Date(lastSync).toLocaleString();
			infoEl.textContent = `Last sync: ${date}`;
		} else {
			infoEl.textContent = "Never synced.";
		}
	}
	updateInfo();

	// ── Visibility toggling ──
	function updateVisibility() {
		const enabled = plugin.settings.remoteStorage.enabled;
		const backend = plugin.settings.remoteStorage.backend;

		passphraseRow.style.display = enabled ? "" : "none";
		autoSyncRow.style.display = enabled ? "" : "none";
		conflictRow.style.display = enabled ? "" : "none";
		webdavSection.style.display =
			enabled && backend === "webdav" ? "" : "none";
		syncBtn.style.display = enabled ? "" : "none";
		infoRow.style.display = enabled ? "" : "none";
	}

	updateVisibility();
}
