import { App, Modal, Notice, Setting } from "obsidian";
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

/** Calculate disk usage of the plugin directory using Node fs APIs (Electron environment). */
async function calculatePluginDiskUsage(
	pluginDir: string,
): Promise<DiskUsageBreakdown | null> {
	try {
		// Dynamic require for Node fs — safe in Electron, graceful fallback if unavailable
		const fs = require("fs") as typeof import("fs");
		const path = require("path") as typeof import("path");

		if (!fs || !path) return null;

		const walk = async (dir: string): Promise<{ size: number; files: Map<string, number> }> => {
			let total = 0;
			const files = new Map<string, number>();
			const entries = await fs.promises.readdir(dir, { withFileTypes: true });
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
				/\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mp3|wav|ogg|pdf|docx?|zip)$/i.test(basename)
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
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
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
		.setDesc("Maximum size for the debug log file. When exceeded, the file is truncated to keep the most recent entries.")
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

	const metricsEl = sectionEl.createDiv({ cls: "obsidian-ai-settings-metrics" });

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
	const modelUsageEl = createMetric("Estimated usage by model", "—");
	const usageChartEl = sectionEl.createDiv({ cls: "obsidian-ai-usage-chart" });
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
			usageTotalEl.textContent = `~${usage.totalEstimatedTokens.toLocaleString()} tokens`;
			usageSplitEl.textContent = `~${usage.inputEstimatedTokens.toLocaleString()} / ~${usage.outputEstimatedTokens.toLocaleString()} tokens`;
			responseStatsEl.textContent = usage.averageResponseTimeMs === null
				? String(usage.completedResponses)
				: `${usage.completedResponses} · ${(usage.averageResponseTimeMs / 1000).toFixed(1)}s avg`;
			modelUsageEl.textContent = usage.modelEstimatedTokens.length === 0
				? "No saved estimates"
				: usage.modelEstimatedTokens
					.map(({ model, tokens }) => `${model}: ~${tokens.toLocaleString()}`)
					.join(" · ");
			usageChartEl.empty(); const top = usage.modelEstimatedTokens.slice(0, 6); const max = top[0]?.tokens || 1;
			for (const { model, tokens } of top) { const row = usageChartEl.createDiv({ cls: "obsidian-ai-usage-chart-row" }); row.createEl("span", { text: model, cls: "obsidian-ai-usage-chart-label", attr: { title: model } }); const track = row.createDiv({ cls: "obsidian-ai-usage-chart-track" }); track.createDiv({ cls: "obsidian-ai-usage-chart-bar", attr: { style: `width:${tokens / max * 100}%` } }); row.createEl("span", { text: `~${tokens.toLocaleString()}`, cls: "obsidian-ai-usage-chart-value" }); }
		} catch {
			sessionsEl.textContent = "?";
			messagesEl.textContent = "?";
			usageTotalEl.textContent = "?";
			usageSplitEl.textContent = "?";
			responseStatsEl.textContent = "?";
			modelUsageEl.textContent = "?";
		}

		// Disk usage
		try {
			const pluginDir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
			const usage = await calculatePluginDiskUsage(pluginDir);
			if (usage) {
				diskTotalEl.textContent = formatBytes(usage.total);
				const parts: string[] = [];
				if (usage.chats > 0) parts.push(`${formatBytes(usage.chats)} chats`);
				if (usage.attachments > 0) parts.push(`${formatBytes(usage.attachments)} attachments`);
				if (usage.settings > 0) parts.push(`${formatBytes(usage.settings)} settings`);
				if (usage.other > 0) parts.push(`${formatBytes(usage.other)} other`);
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
		.setName("Force garbage collection")
		.setDesc(
			"To force GC, open DevTools (Ctrl/Cmd+Shift+I) and run the GC profiler.",
		)
		.addButton((btn) =>
			btn
				.setButtonText("Open DevTools")
				.onClick(() => {
					// @ts-ignore
					if (app?.vault?.adapter?.openDevTools) {
						// @ts-ignore
						app.vault.adapter.openDevTools();
					} else {
						new Notice(
							"DevTools shortcut: Ctrl+Shift+I (or Cmd+Opt+I on macOS)",
							8000,
						);
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
					btnContainer.style.display = "flex";
					btnContainer.style.gap = "8px";
					btnContainer.style.marginTop = "12px";

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
