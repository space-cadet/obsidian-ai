import { Notice, Setting, requestUrl } from "obsidian";
import ObsidianAIPlugin from "../main";
import { WebDAVStorageAdapter } from "../sync/WebDAVStorageAdapter";

/**
 * Test WebDAV connection using Obsidian's requestUrl for reliable
 * error diagnostics.
 */
async function testWebDAVConnection(
	url: string,
	username: string,
	password: string,
): Promise<{
	ok: boolean;
	error?: string;
	detail?: string;
	debugInfo?: string;
}> {
	if (!url.trim()) {
		return { ok: false, error: "WebDAV URL is required." };
	}
	if (!username.trim()) {
		return { ok: false, error: "Username is required." };
	}
	if (!password) {
		return { ok: false, error: "Password / app token is required." };
	}

	// Normalize URL: ensure trailing slash
	let baseUrl = url.trim();
	if (!baseUrl.endsWith("/")) {
		baseUrl += "/";
	}

	const authHeader = "Basic " + btoa(username.trim() + ":" + password);

	try {
		// Try a PROPFIND on the root to verify auth + connectivity
		const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>`;

		await requestUrl({
			url: baseUrl,
			method: "PROPFIND",
			headers: {
				Authorization: authHeader,
				"Content-Type": "application/xml; charset=utf-8",
				Depth: "0",
			},
			body: xml,
			throw: true,
		});

		return { ok: true };
	} catch (err: any) {
		const status = err.status;
		let error = err.message || String(err);
		let detail = "";

		if (status === 401) {
			error = "Authentication failed. Check username / app token.";
			detail =
				"Nextcloud: Use an app-specific password, not your login password.";
		} else if (status === 404) {
			error = "URL not found. Check the WebDAV endpoint path.";
			detail =
				"Typical Nextcloud URL: https://cloud.example.com/remote.php/dav/files/username/";
		} else if (status === 403) {
			error =
				"Access forbidden. Check permissions or WebDAV app is enabled.";
		} else if (status === 0 || error.includes("net::ERR")) {
			error = "Cannot reach server. Check URL and network.";
		} else if (error.includes("CORS")) {
			error = "CORS blocked. Try using the full WebDAV URL.";
		}

		// Build debug info for mobile troubleshooting (no console access)
		const debugInfo = JSON.stringify({
			status,
			message: err.message,
			url: baseUrl,
			headersSent: {
				Authorization: "Basic ***",
				"Content-Type": "application/xml",
				Depth: "0",
			},
		});

		return { ok: false, error, detail, debugInfo };
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

	section.createEl("p", {
		cls: "setting-item-description",
		text:
			"Sync your chat sessions to remote storage for cross-device access and backup. " +
			"All data is encrypted end-to-end before leaving your device.",
	});

	const rs = plugin.settings.remoteStorage;

	// ── Enable toggle ──
	new Setting(section)
		.setName("Enable Remote Storage")
		.setDesc("Turn on to sync chat sessions to a remote backend.")
		.addToggle((toggle) =>
			toggle.setValue(rs.enabled).onChange(async (value) => {
				rs.enabled = value;
				await saveSettings({ quiet: true });
				updateVisibility();
			}),
		);

	// ── Backend selector ──
	const backendSetting = new Setting(section)
		.setName("Storage Backend")
		.addDropdown((dropdown) => {
			dropdown
				.addOption("none", "— Select backend —")
				.addOption("webdav", "WebDAV (Nextcloud, ownCloud, generic)")
				.addOption("s3", "S3-compatible — coming soon")
				.addOption("custom", "Custom REST API — coming soon")
				.setValue(rs.backend)
				.onChange(async (value) => {
					rs.backend = value as any;
					await saveSettings({ quiet: true });
					updateVisibility();
				});
		});

	// ── Encryption toggle ──
	let passphraseSetting: Setting;
	new Setting(section)
		.setName("Encrypt Data")
		.setDesc("Encrypt sessions before uploading. Strongly recommended.")
		.addToggle((toggle) =>
			toggle.setValue(rs.passphrase !== "").onChange(async (value) => {
				if (!value) {
					rs.passphrase = "";
					await saveSettings({ quiet: true });
				}
				updateVisibility();
			}),
		);

	// ── Passphrase ──
	passphraseSetting = new Setting(section)
		.setName("Encryption Passphrase")
		.setDesc(
			"Used to encrypt/decrypt your data. Never stored on the server. Required on every device.",
		)
		.addText((text) =>
			text
				.setPlaceholder("Enter a strong passphrase")
				.setValue(rs.passphrase)
				.onChange(async (value) => {
					rs.passphrase = value;
					await saveSettings({ quiet: true });
				}),
		);
	passphraseSetting.controlEl.querySelector("input")!.type = "password";

	// ── Auto-sync toggle ──
	new Setting(section)
		.setName("Auto-sync")
		.setDesc("Automatically sync when sessions change.")
		.addToggle((toggle) =>
			toggle.setValue(rs.autoSync).onChange(async (value) => {
				rs.autoSync = value;
				await saveSettings({ quiet: true });
			}),
		);

	// ── Conflict strategy ──
	new Setting(section)
		.setName("Conflict Resolution")
		.setDesc(
			"How to resolve when the same session is edited on multiple devices.",
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption(
					"last-write-wins",
					"Last write wins (newest version)",
				)
				.addOption("keep-both", "Keep both copies")
				.addOption("manual", "Manual resolution")
				.setValue(rs.conflictStrategy)
				.onChange(async (value) => {
					rs.conflictStrategy = value as any;
					await saveSettings({ quiet: true });
				});
		});

	// ═══════════════════════════════════════════════════
	// WebDAV-specific settings
	// ═══════════════════════════════════════════════════
	const webdavSection = section.createEl("div", {
		cls: "obsidian-ai-webdav-settings",
	});
	webdavSection.createEl("h3", { text: "WebDAV Configuration" });

	// URL
	new Setting(webdavSection)
		.setName("WebDAV URL")
		.setDesc("Your Nextcloud/ownCloud WebDAV endpoint.")
		.addText((text) =>
			text
				.setPlaceholder(
					"https://cloud.example.com/remote.php/dav/files/username/",
				)
				.setValue(rs.webdav?.url ?? "")
				.onChange(async (value) => {
					rs.webdav ??= {
						type: "webdav",
						url: "",
						username: "",
						password: "",
						prefix: "obsidian-ai-sync/",
						enabled: false,
					};
					rs.webdav.url = value.trim();
					await saveSettings({ quiet: true });
				}),
		);

	// Username
	new Setting(webdavSection).setName("Username").addText((text) =>
		text
			.setPlaceholder("Username")
			.setValue(rs.webdav?.username ?? "")
			.onChange(async (value) => {
				rs.webdav ??= {
					type: "webdav",
					url: "",
					username: "",
					password: "",
					prefix: "obsidian-ai-sync/",
					enabled: false,
				};
				rs.webdav.username = value.trim();
				await saveSettings({ quiet: true });
			}),
	);

	// Password
	const passSetting = new Setting(webdavSection)
		.setName("Password / App Token")
		.setDesc(
			"For Nextcloud, generate an app-specific token in Settings → Security.",
		)
		.addText((text) =>
			text
				.setPlaceholder("Password or app-specific token")
				.setValue(rs.webdav?.password ?? "")
				.onChange(async (value) => {
					rs.webdav ??= {
						type: "webdav",
						url: "",
						username: "",
						password: "",
						prefix: "obsidian-ai-sync/",
						enabled: false,
					};
					rs.webdav.password = value;
					await saveSettings({ quiet: true });
				}),
		);
	passSetting.controlEl.querySelector("input")!.type = "password";

	// Prefix
	new Setting(webdavSection)
		.setName("Path Prefix")
		.setDesc("Directory under which sessions are stored.")
		.addText((text) =>
			text
				.setValue(rs.webdav?.prefix ?? "obsidian-ai-sync/")
				.onChange(async (value) => {
					rs.webdav ??= {
						type: "webdav",
						url: "",
						username: "",
						password: "",
						prefix: "obsidian-ai-sync/",
						enabled: false,
					};
					rs.webdav.prefix = value.trim() || "obsidian-ai-sync/";
					await saveSettings({ quiet: true });
				}),
		);

	// ── Test + Sync buttons ──
	const btnSetting = new Setting(webdavSection)
		.setName("Connection")
		.setDesc("Test your WebDAV configuration before syncing.");

	btnSetting.addButton((button) =>
		button
			.setButtonText("🧪 Test Connection")
			.setCta()
			.onClick(async () => {
				const url = rs.webdav?.url ?? "";
				const user = rs.webdav?.username ?? "";
				const pass = rs.webdav?.password ?? "";

				button.setButtonText("Testing…");
				button.setDisabled(true);

				const result = await testWebDAVConnection(url, user, pass);

				button.setButtonText("🧪 Test Connection");
				button.setDisabled(false);

				if (result.ok) {
					new Notice("✅ WebDAV connection successful!");
					rs.webdav ??= {
						type: "webdav",
						url: "",
						username: "",
						password: "",
						prefix: "obsidian-ai-sync/",
						enabled: false,
					};
					rs.webdav.enabled = true;
					await saveSettings({ quiet: true });
				} else {
					let msg = `❌ ${result.error}`;
					if (result.detail) {
						msg += `\n${result.detail}`;
					}
					if (result.debugInfo) {
						msg += `\n\nDebug: ${result.debugInfo}`;
					}
					new Notice(msg, 10000);
				}
			}),
	);

	btnSetting.addButton((button) =>
		button.setButtonText("🔄 Sync Now").onClick(async () => {
			if (!rs.enabled) {
				new Notice("Enable remote storage first.");
				return;
			}
			button.setButtonText("Syncing…");
			button.setDisabled(true);

			const result = await plugin.triggerSync();

			button.setButtonText("🔄 Sync Now");
			button.setDisabled(false);

			if (result.ok) {
				new Notice(`✅ Sync complete: ${result.message}`);
			} else {
				new Notice(`❌ ${result.message}`, 8000);
			}
		}),
	);

	// ── Last sync info ──
	const infoEl = section.createEl("div", {
		cls: "setting-item-description",
		text:
			rs.lastSyncTime > 0
				? `Last sync: ${new Date(rs.lastSyncTime).toLocaleString()}`
				: "Never synced.",
	});
	infoEl.style.marginTop = "12px";

	// ── Visibility toggling ──
	function updateVisibility() {
		const enabled = rs.enabled;
		const backend = rs.backend;
		const encryptEnabled = rs.passphrase !== "";

		passphraseSetting.settingEl.style.display = enabled ? "" : "none";
		passphraseSetting.setDesc(
			enabled && !encryptEnabled
				? "⚠️ Warning: No passphrase set. Data will be stored unencrypted on the remote server."
				: "Used to encrypt/decrypt your data. Never stored on the server. Required on every device.",
		);

		webdavSection.style.display =
			enabled && backend === "webdav" ? "" : "none";
	}

	updateVisibility();
}
