import { Setting, Notice } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderIntelligenceSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"AI Intelligence Layer",
		"Give the AI persistent memory, identity, and cross-session awareness — like a local OpenClaw inside Obsidian.",
	);

	new Setting(sectionEl)
		.setName("Enable intelligence layer")
		.setDesc(
			"When enabled, the AI loads a persistent persona and memory on every session. " +
			"It can create memories and search past conversations.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.intelligence.enableIntelligence)
				.onChange(async (value) => {
					plugin.settings.intelligence.enableIntelligence = value;
					if (value && plugin.personaLoader) {
						await plugin.personaLoader.ensureDefaults();
					}
					await saveSettings({ refresh: true });
				});
		});

	if (!plugin.settings.intelligence.enableIntelligence) {
		// Collapse the rest when disabled
		const hint = sectionEl.createEl("div", {
			cls: "setting-item-description",
		});
		hint.style.padding = "0 16px 12px";
		hint.style.color = "var(--text-muted)";
		hint.textContent =
			"Turn this on to unlock memory creation, persona loading, and cross-session search. " +
			"All data stays in the plugin directory — never in your vault.";
		return;
	}

	new Setting(sectionEl)
		.setName("Identity context budget")
		.setDesc(
			"Max tokens for persona + memory injected into the system prompt. " +
			"Higher values = more context but consume more of your model's window.",
		)
		.addText((text) => {
			text.setPlaceholder("2000")
				.setValue(String(plugin.settings.intelligence.identityContextBudget))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.intelligence.identityContextBudget =
						Number.isFinite(value) && value >= 500 ? value : 2000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Persona file path")
		.setDesc(
			"Path to the AI's static identity file, relative to the plugin folder. " +
			"Edit this to customize how the AI behaves.",
		)
		.addText((text) => {
			text.setPlaceholder("intelligence/persona.md")
				.setValue(plugin.settings.intelligence.personaPath)
				.onChange(async (value) => {
					plugin.settings.intelligence.personaPath = value || "intelligence/persona.md";
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Memory file path")
		.setDesc(
			"Path to the AI's dynamic memory file. The AI appends facts, preferences, and project updates here.",
		)
		.addText((text) => {
			text.setPlaceholder("intelligence/memory.md")
				.setValue(plugin.settings.intelligence.memoryPath)
				.onChange(async (value) => {
					plugin.settings.intelligence.memoryPath = value || "intelligence/memory.md";
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Auto-summarize sessions")
		.setDesc(
			"When enabled, the AI automatically summarizes ended sessions and saves key points to memory. " +
			"Triggered when you start a new chat session.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.intelligence.autoSummarize)
				.onChange(async (value) => {
					plugin.settings.intelligence.autoSummarize = value;
					await saveSettings({ refresh: true });
				});
		});

	if (plugin.settings.intelligence.autoSummarize) {
		new Setting(sectionEl)
			.setName("Min messages before summarizing")
			.setDesc(
				"Sessions with fewer messages than this will be skipped. " +
				"Prevents summarizing trivial conversations.",
			)
			.addSlider((slider) => {
				slider
					.setLimits(2, 20, 1)
					.setValue(plugin.settings.intelligence.autoSummarizeMinMessages)
					.setDynamicTooltip()
					.onChange(async (value) => {
						plugin.settings.intelligence.autoSummarizeMinMessages = value;
						await saveSettings();
					});
			});
	}

	new Setting(sectionEl)
		.setName("Enable memory audit tool")
		.setDesc(
			"When enabled, the AI can query the memory audit log via the read_memory_audit tool. " +
			"Useful for debugging memory issues. Off by default to prevent context bloat.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.intelligence.enableMemoryAuditTool)
				.onChange(async (value) => {
					plugin.settings.intelligence.enableMemoryAuditTool = value;
					await saveSettings();
				});
		});

	// ── Memory Stats & Export ──
	const statsEl = sectionEl.createEl("div", { cls: "setting-item" });
	statsEl.style.padding = "12px 16px";
	statsEl.style.borderTop = "1px solid var(--background-modifier-border)";
	statsEl.style.marginTop = "8px";

	const statsLabel = statsEl.createEl("div", { text: "Memory Statistics", cls: "setting-item-name" });
	statsLabel.style.fontWeight = "600";
	statsLabel.style.marginBottom = "8px";

	const statsContent = statsEl.createEl("div", { cls: "setting-item-description" });
	statsContent.style.fontSize = "0.9em";
	statsContent.style.lineHeight = "1.6";

	async function refreshStats() {
		if (!plugin.personaLoader) {
			statsContent.textContent = "Intelligence layer not initialized.";
			return;
		}
		try {
			const entries = await plugin.personaLoader.memoryStore.list();
			const jsonPath = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/intelligence/memory.json`;
			const mdPath = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/intelligence/memory.md`;
			const adapter = plugin.app.vault.adapter;

			let jsonSize = 0;
			let mdSize = 0;
			try {
				if (await adapter.exists(jsonPath)) {
					const stat = await adapter.stat(jsonPath);
					jsonSize = stat?.size ?? 0;
				}
			} catch { /* ignore */ }
			try {
				if (await adapter.exists(mdPath)) {
					const stat = await adapter.stat(mdPath);
					mdSize = stat?.size ?? 0;
				}
			} catch { /* ignore */ }

			const totalSize = jsonSize + mdSize;
			const sizeStr = totalSize < 1024
				? `${totalSize} B`
				: totalSize < 1024 * 1024
					? `${(totalSize / 1024).toFixed(1)} KB`
					: `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;

			const categories: Record<string, number> = {};
			for (const e of entries) {
				categories[e.category] = (categories[e.category] || 0) + 1;
			}
			const catLines = Object.entries(categories)
				.map(([cat, count]) => `  • ${cat}: ${count}`)
				.join("\n");

			statsContent.innerHTML = `
<strong>${entries.length}</strong> entries | <strong>${sizeStr}</strong> total<br/>
${catLines || "  No categorized entries yet."}
			`.trim();
		} catch (e) {
			statsContent.textContent = "Unable to read memory statistics.";
		}
	}
	void refreshStats();

	// Export buttons row
	const exportRow = statsEl.createEl("div");
	exportRow.style.display = "flex";
	exportRow.style.gap = "8px";
	exportRow.style.marginTop = "10px";
	exportRow.style.flexWrap = "wrap";

	const exportJsonBtn = exportRow.createEl("button", { text: "Export JSON" });
	exportJsonBtn.addClass("mod-cta");
	exportJsonBtn.addEventListener("click", async () => {
		if (!plugin.personaLoader) {
			new Notice("Intelligence layer not initialized.");
			return;
		}
		try {
			const entries = await plugin.personaLoader.memoryStore.list();
			const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `obsidian-ai-memory-${new Date().toISOString().split("T")[0]}.json`;
			a.click();
			URL.revokeObjectURL(url);
			new Notice(`Exported ${entries.length} memories to JSON.`);
		} catch (e: any) {
			new Notice(`Export failed: ${e.message}`);
		}
	});

	const exportMdBtn = exportRow.createEl("button", { text: "Export Markdown" });
	exportMdBtn.addEventListener("click", async () => {
		if (!plugin.personaLoader) {
			new Notice("Intelligence layer not initialized.");
			return;
		}
		try {
			const entries = await plugin.personaLoader.memoryStore.list();
			const lines = [
				"# AI Memory Export",
				"",
				`Generated: ${new Date().toISOString()}`,
				`Total entries: ${entries.length}`,
				"",
				"## Entries",
				"",
			];
			for (const e of entries) {
				const tagStr = e.tags.length ? " " + e.tags.map((t) => `#${t}`).join(" ") : "";
				lines.push(`- [${e.timestamp}] **${e.category}**: ${e.content}${tagStr} [id:${e.id}]`);
			}
			lines.push("");
			const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `obsidian-ai-memory-${new Date().toISOString().split("T")[0]}.md`;
			a.click();
			URL.revokeObjectURL(url);
			new Notice(`Exported ${entries.length} memories to Markdown.`);
		} catch (e: any) {
			new Notice(`Export failed: ${e.message}`);
		}
	});

	const refreshBtn = exportRow.createEl("button", { text: "Refresh Stats" });
	refreshBtn.addEventListener("click", () => void refreshStats());

	// ── Audit Log ──
	const auditEl = sectionEl.createEl("details", { cls: "setting-item" });
	auditEl.style.padding = "12px 16px";
	auditEl.style.borderTop = "1px solid var(--background-modifier-border)";
	auditEl.style.marginTop = "8px";

	const auditSummary = auditEl.createEl("summary", { text: "Memory Audit Log" });
	auditSummary.style.fontWeight = "600";
	auditSummary.style.cursor = "pointer";
	auditSummary.style.userSelect = "none";

	const auditContent = auditEl.createEl("div", { cls: "setting-item-description" });
	auditContent.style.fontSize = "0.85em";
	auditContent.style.lineHeight = "1.6";
	auditContent.style.marginTop = "8px";
	auditContent.style.maxHeight = "300px";
	auditContent.style.overflow = "auto";

	async function refreshAudit() {
		if (!plugin.personaLoader) {
			auditContent.textContent = "Intelligence layer not initialized.";
			return;
		}
		try {
			const entries = await plugin.personaLoader.memoryStore.readAudit(20);
			if (entries.length === 0) {
				auditContent.textContent = "No audit entries yet. Memory operations will be logged here.";
				return;
			}
			const lines = entries.map((e) => {
				const time = new Date(e.timestamp).toLocaleString();
				const icon = e.operation === "create" ? "+" : e.operation === "update" ? "✎" : "−";
				const preview = e.content ? `"${e.content.slice(0, 60)}${e.content.length > 60 ? "…" : ""}"` : "";
				return `<span style="color:var(--text-muted)">${time}</span> <strong>${icon} ${e.operation}</strong> [${e.entryId}] ${preview}`;
			});
			auditContent.innerHTML = lines.join("<br/>");
		} catch (e) {
			auditContent.textContent = "Unable to read audit log.";
		}
	}

	// Refresh audit when expanded
	auditEl.addEventListener("toggle", () => {
		if (auditEl.open) void refreshAudit();
	});

	const auditRefreshBtn = auditEl.createEl("button", { text: "Refresh Audit" });
	auditRefreshBtn.style.marginTop = "8px";
	auditRefreshBtn.style.fontSize = "0.85em";
	auditRefreshBtn.addEventListener("click", () => void refreshAudit());

	// Button to open intelligence folder
	const openDirBtn = sectionEl.createEl("button", {
		text: "Open Intelligence Folder",
		cls: "mod-cta",
	});
	openDirBtn.style.margin = "8px 16px 12px";
	openDirBtn.addEventListener("click", () => {
		const dir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/intelligence`;
		// Copy path to clipboard and notify user
		navigator.clipboard.writeText(dir).catch(() => {});
		new Notice(
			`Intelligence folder path copied to clipboard:\n${dir}`,
			8000,
		);
	});
}
