import { App, Modal, Notice, Platform, Setting, TFile } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";
import { summarizeLlmUsage } from "../lib/usageStats";

interface DiskUsageBreakdown {
	total: number;
	chats: number;
	attachments: number;
	settings: number;
	other: number;
}

interface DiagnosticsExport {
	exportVersion: string;
	exportedAt: string;
	pluginVersion: string;
	settings: Record<string, unknown>;
	sessions: {
		id: string;
		title: string;
		createdAt: number;
		updatedAt: number;
		messageCount: number;
		model?: string;
	}[];
	usage: ReturnType<typeof summarizeLlmUsage>;
	memoryStats?: {
		totalMemories: number;
		byCategory: Record<string, number>;
	};
	debugInfo: {
		platform: string;
		obsidianVersion: string;
		pluginVersion: string;
		heapUsedMB: number | null;
		heapTotalMB: number | null;
		domNodes: number;
	};
}

/** Calculate disk usage of the plugin directory using Node fs APIs (Electron environment). */
async function calculatePluginDiskUsage(
	pluginDir: string,
): Promise<DiskUsageBreakdown | null> {
	if (!Platform.isDesktop) return null;

	try {
		// Node modules are loaded only after the desktop guard; mobile never evaluates them.
		const [fs, path] = await Promise.all([import("fs"), import("path")]);

		const walk = async (
			dir: string,
		): Promise<{ size: number; files: Map<string, number> }> => {
			let total = 0;
			const files = new Map<string, number>();
			const entries = await fs.promises.readdir(dir, {
				withFileTypes: true,
			});
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					const sub = await walk(fullPath);
					total += sub.size;
					for (const [p, s] of sub.files) files.set(p, s);
				} else {
					const stat = await fs.promises.stat(fullPath);
					total += stat.size;
					files.set(fullPath, stat.size);
				}
			}
			return { size: total, files };
		};

		const { size: total, files } = await walk(pluginDir);

		let chats = 0;
		let attachments = 0;
		let settings = 0;
		let other = 0;

		for (const [filePath, size] of files) {
			const basename = path.basename(filePath);
			const relative = path.relative(pluginDir, filePath);

			if (relative.startsWith("sessions" + path.sep)) {
				chats += size;
			} else if (basename === "data.json" || basename.endsWith(".json")) {
				settings += size;
			} else if (
				/\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mp3|wav|ogg|pdf|docx?|zip)$/i.test(
					basename,
				)
			) {
				attachments += size;
			} else {
				other += size;
			}
		}

		return { total, chats, attachments, settings, other };
	} catch {
		return null;
	}
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
	const value = bytes / Math.pow(1024, i);
	return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function renderDiagnosticsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	app: App,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Diagnostics",
		"Monitor runtime state, manage debug behavior, and clear saved chat data when needed.",
	);

	new Setting(sectionEl)
		.setName("Debug log level")
		.setDesc("Choose how much runtime information the plugin records.")
		.addDropdown((dropdown) =>
			dropdown
				.addOption("off", "Off")
				.addOption("error", "Errors only")
				.addOption("info", "Info")
				.addOption("debug", "Debug")
				.setValue(plugin.settings.debugLogLevel)
				.onChange(async (value) => {
					plugin.settings.debugLogLevel = value as
						| "off"
						| "error"
						| "info"
						| "debug";
					await saveSettings();
				}),
		);

	new Setting(sectionEl)
		.setName("Debug log max size (MB)")
		.setDesc(
			"Maximum size for the debug log file. When exceeded, the file is truncated to keep the most recent entries.",
		)
		.addText((text) => {
			text.setPlaceholder("5")
				.setValue(String(plugin.settings.debugLogMaxSizeMB))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseFloat(text.getValue());
					plugin.settings.debugLogMaxSizeMB =
						Number.isFinite(value) && value > 0 ? value : 5;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Debug log retention")
		.setDesc("Approximate number of log lines to retain before rotation.")
		.addText((text) => {
			text.setPlaceholder("200")
				.setValue(String(plugin.settings.debugLogRetention))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.debugLogRetention =
						Number.isFinite(value) && value > 0 ? value : 200;
					await saveSettings();
				});
		});

	const metricsEl = sectionEl.createDiv({
		cls: "obsidian-ai-settings-metrics",
	});

	const createMetric = (label: string, value: string) => {
		const wrapper = metricsEl.createDiv({
			cls: "obsidian-ai-settings-metric",
		});
		wrapper.createEl("div", {
			text: label,
			cls: "obsidian-ai-settings-metric-label",
		});
		const valueEl = wrapper.createEl("div", {
			text: value,
			cls: "obsidian-ai-settings-metric-value",
		});
		return valueEl;
	};

	const heapUsedEl = createMetric("JS Heap Used", "—");
	const heapTotalEl = createMetric("JS Heap Total", "—");
	const heapLimitEl = createMetric("JS Heap Limit", "—");
	const domNodesEl = createMetric("DOM Nodes", "—");
	const sessionsEl = createMetric("Chat Sessions", "—");
	const messagesEl = createMetric("Total Messages", "—");
	const usageTotalEl = createMetric("LLM Usage (estimated)", "—");
	const usageSplitEl = createMetric("Estimated input / output", "—");
	const responseStatsEl = createMetric("Completed responses", "—");
	const modelUsageEl = sectionEl.createDiv({
		cls: "obsidian-ai-model-usage",
	});
	modelUsageEl.createEl("h4", { text: "Usage by model" });
	const diskTotalEl = createMetric("Plugin Storage", "—");
	const diskBreakdownEl = createMetric("Storage Breakdown", "—");

	const refreshMetrics = async () => {
		const mem = (performance as any).memory;
		if (mem) {
			heapUsedEl.textContent = `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`;
			heapTotalEl.textContent = `${(mem.totalJSHeapSize / 1024 / 1024).toFixed(1)} MB`;
			heapLimitEl.textContent = `${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)} MB`;
		} else {
			heapUsedEl.textContent = "N/A";
			heapTotalEl.textContent = "N/A";
			heapLimitEl.textContent = "N/A";
		}

		domNodesEl.textContent = String(
			document.getElementsByTagName("*").length,
		);

		try {
			const chatData = await plugin.loadChatData();
			const sessionCount = chatData.sessions.length;
			const msgCount = chatData.sessions.reduce(
				(sum, s) => sum + s.messages.length,
				0,
			);
			sessionsEl.textContent = String(sessionCount);
			messagesEl.textContent = String(msgCount);
			const usage = summarizeLlmUsage(chatData.sessions);
			const estimateMark = usage.usageSource === "provider" ? "" : "~";
			usageTotalEl.textContent = `${estimateMark}${usage.totalEstimatedTokens.toLocaleString()} tokens`;
			usageSplitEl.textContent = `${estimateMark}${usage.inputEstimatedTokens.toLocaleString()} / ${estimateMark}${usage.outputEstimatedTokens.toLocaleString()} tokens`;
			responseStatsEl.textContent =
				usage.averageResponseTimeMs === null
					? String(usage.completedResponses)
					: `${usage.completedResponses} · ${(usage.averageResponseTimeMs / 1000).toFixed(1)}s avg`;
			modelUsageEl
				.querySelector(".obsidian-ai-model-usage-content")
				?.remove();
			const modelUsageContent = modelUsageEl.createDiv({
				cls: "obsidian-ai-model-usage-content",
			});
			if (usage.modelEstimatedTokens.length === 0) {
				modelUsageContent.createEl("p", {
					text: "No saved estimates yet.",
					cls: "setting-item-description",
				});
			} else {
				const maxTokens = Math.max(
					...usage.modelEstimatedTokens.map((u) => u.tokens),
				);
				for (const { model, tokens } of usage.modelEstimatedTokens) {
					const pct = maxTokens > 0 ? (tokens / maxTokens) * 100 : 0;
					const row = modelUsageContent.createDiv({
						cls: "obsidian-ai-usage-bar-row",
					});
					row.createEl("span", {
						text: model,
						cls: "obsidian-ai-usage-bar-label",
						attr: { title: model },
					});
					const track = row.createDiv({
						cls: "obsidian-ai-usage-bar-track",
					});
					const fill = track.createDiv({
						cls: "obsidian-ai-usage-bar-fill",
					});
					fill.setCssStyles({ width: `${pct}%` });
					row.createEl("span", {
						text: `~${tokens.toLocaleString()}`,
						cls: "obsidian-ai-usage-bar-value",
					});
				}
			}
		} catch {
			sessionsEl.textContent = "?";
			messagesEl.textContent = "?";
			usageTotalEl.textContent = "?";
			usageSplitEl.textContent = "?";
			responseStatsEl.textContent = "?";
			modelUsageEl
				.querySelector(".obsidian-ai-model-usage-content")
				?.remove();
			modelUsageEl.createEl("p", {
				text: "Usage data unavailable.",
				cls: "obsidian-ai-model-usage-content setting-item-description",
			});
		}

		// Disk usage
		try {
			const pluginDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
			const usage = await calculatePluginDiskUsage(pluginDir);
			if (usage) {
				diskTotalEl.textContent = formatBytes(usage.total);
				const parts: string[] = [];
				if (usage.chats > 0)
					parts.push(`${formatBytes(usage.chats)} chats`);
				if (usage.attachments > 0)
					parts.push(`${formatBytes(usage.attachments)} attachments`);
				if (usage.settings > 0)
					parts.push(`${formatBytes(usage.settings)} settings`);
				if (usage.other > 0)
					parts.push(`${formatBytes(usage.other)} other`);
				diskBreakdownEl.textContent = parts.join(", ") || "Empty";
			} else {
				diskTotalEl.textContent = "N/A";
				diskBreakdownEl.textContent = "File system unavailable";
			}
		} catch {
			diskTotalEl.textContent = "Error";
			diskBreakdownEl.textContent = "Could not read storage";
		}
	};

	new Setting(sectionEl)
		.setName("Refresh metrics")
		.setDesc("Update the diagnostic numbers above.")
		.addButton((btn) =>
			btn
				.setButtonText("Refresh")
				.setIcon("refresh-cw")
				.onClick(() => {
					btn.setDisabled(true);
					refreshMetrics().then(() => {
						btn.setDisabled(false);
					});
				}),
		);

	new Setting(sectionEl)
		.setName("Export diagnostics")
		.setDesc(
			"Download a JSON file with plugin diagnostics, settings (redacted), and session metadata for debugging or benchmark fixtures.",
		)
		.addButton((btn) =>
			btn
				.setButtonText("Export")
				.setIcon("download")
				.onClick(async () => {
					btn.setDisabled(true);
					try {
						const chatData = await plugin.loadChatData();
						const usage = summarizeLlmUsage(chatData.sessions);

						// Redact sensitive settings
						const redactedSettings = { ...plugin.settings };
						for (const key of Object.keys(redactedSettings)) {
							if (
								/key|token|password|secret|credential/i.test(
									key,
								)
							) {
								(redactedSettings as Record<string, unknown>)[
									key
								] = "<redacted>";
							}
						}
						if (
							(redactedSettings as Record<string, unknown>)
								.apiProfiles
						) {
							const profiles = (
								redactedSettings as Record<string, unknown>
							).apiProfiles as Array<Record<string, unknown>>;
							(
								redactedSettings as Record<string, unknown>
							).apiProfiles = profiles.map((p) => ({
								...p,
								apiKey: "<redacted>",
							}));
						}

						const mem = (performance as any).memory;
						const exportData: DiagnosticsExport = {
							exportVersion: "1.0",
							exportedAt: new Date().toISOString(),
							pluginVersion: plugin.manifest.version,
							settings: redactedSettings,
							sessions: chatData.sessions.map((s) => ({
								id: s.id,
								title: s.title,
								createdAt: s.createdAt,
								updatedAt: s.updatedAt,
								messageCount: s.messages.length,
								model: (s as any).model ?? "unknown",
							})),
							usage,
							debugInfo: {
								platform: Platform.isMobile
									? "mobile"
									: "desktop",
								obsidianVersion:
									(app as any).version ?? "unknown",
								pluginVersion: plugin.manifest.version,
								heapUsedMB: mem
									? Math.round(
											mem.usedJSHeapSize / 1024 / 1024,
										)
									: null,
								heapTotalMB: mem
									? Math.round(
											mem.totalJSHeapSize / 1024 / 1024,
										)
									: null,
								domNodes:
									document.getElementsByTagName("*").length,
							},
						};

						// Write to vault
						const filename = `obsidian-ai-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
						const content = JSON.stringify(exportData, null, 2);
						const file = await app.vault.create(filename, content);

						new Notice(`✓ Exported to ${filename}`);
					} catch (err) {
						new Notice(
							`Export failed: ${err instanceof Error ? err.message : String(err)}`,
						);
					} finally {
						btn.setDisabled(false);
					}
				}),
		);

	new Setting(sectionEl)
		.setName("Clear all chat history")
		.setDesc(
			"Permanently delete all saved chat sessions. This frees up storage memory.",
		)
		.addButton((btn) =>
			btn
				.setButtonText("Clear History")
				.setWarning()
				.onClick(async () => {
					const modal = new Modal(app);
					modal.titleEl.setText("Clear all chat history?");
					modal.contentEl.createEl("p", {
						text: "This will permanently delete all chat sessions. This action cannot be undone.",
					});
					const btnContainer = modal.contentEl.createEl("div");
					btnContainer.setCssStyles({
						display: "flex",
						gap: "8px",
						marginTop: "12px",
					});

					const cancelBtn = btnContainer.createEl("button", {
						text: "Cancel",
					});
					cancelBtn.addEventListener("click", () => {
						modal.close();
					});

					const confirmBtn = btnContainer.createEl("button", {
						text: "Clear All",
					});
					confirmBtn.classList.add("mod-warning");
					confirmBtn.addEventListener("click", async () => {
						await plugin.saveChatData({
							sessions: [],
							activeSessionId: null,
						});
						modal.close();
						new Notice("✓ All chat history cleared.");
						refreshMetrics();
					});

					modal.open();
				}),
		);

	refreshMetrics();
}
