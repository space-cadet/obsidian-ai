import { App, Modal, Notice, Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

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
		} catch {
			sessionsEl.textContent = "?";
			messagesEl.textContent = "?";
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
