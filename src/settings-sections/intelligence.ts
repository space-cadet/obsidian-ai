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
	const statsEl = sectionEl.createEl("div", { cls: "obsidian-ai-memory-stats" });

	const statsHeader = statsEl.createEl("div", { cls: "obsidian-ai-memory-stats-header" });

	const statsContent = statsEl.createEl("div", { cls: "obsidian-ai-memory-categories" });

	async function refreshStats() {
		if (!plugin.personaLoader) {
			statsHeader.empty();
			statsHeader.createEl("span", { text: "Intelligence layer not initialized." });
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

			statsHeader.empty();
			statsHeader.createEl("strong", { text: String(entries.length) });
			statsHeader.appendText(" entries · ");
			statsHeader.createEl("strong", { text: sizeStr });
			statsHeader.appendText(" total");

			const categories: Record<string, number> = {};
			for (const e of entries) {
				categories[e.category] = (categories[e.category] || 0) + 1;
			}

			statsContent.empty();
			for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
				statsContent.createEl("span", {
					text: `${cat}: ${count}`,
					cls: "obsidian-ai-memory-chip",
				});
			}
			if (Object.keys(categories).length === 0) {
				statsContent.createEl("span", {
					text: "No categorized entries yet.",
					cls: "obsidian-ai-memory-chip",
					attr: { style: "opacity: 0.6;" },
				});
			}
		} catch (e) {
			statsHeader.empty();
			statsHeader.createEl("span", { text: "Unable to read memory statistics." });
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

	// ── Memory Optimization ──
	const optimizeRow = statsEl.createEl("div");
	optimizeRow.style.marginTop = "12px";
	optimizeRow.style.padding = "10px";
	optimizeRow.style.border = "1px solid var(--background-modifier-border)";
	optimizeRow.style.borderRadius = "6px";
	optimizeRow.style.background = "var(--background-secondary)";

	const optimizeHeader = optimizeRow.createEl("div", { text: "Memory Optimization" });
	optimizeHeader.style.fontWeight = "600";
	optimizeHeader.style.marginBottom = "6px";

	const optimizeDesc = optimizeRow.createEl("div", {
		text: "Remove duplicate entries from historical data. This does not affect new writes — deduplication already happens automatically there.",
	});
	optimizeDesc.style.fontSize = "0.9em";
	optimizeDesc.style.color = "var(--text-muted)";
	optimizeDesc.style.marginBottom = "8px";

	const optimizeResult = optimizeRow.createEl("div");
	optimizeResult.style.fontSize = "0.9em";
	optimizeResult.style.minHeight = "1.5em";

	const optimizeBtn = optimizeRow.createEl("button", { text: "🧹 Prune Duplicates" });
	optimizeBtn.addClass("mod-warning");
	optimizeBtn.addEventListener("click", async () => {
		if (!plugin.personaLoader) {
			new Notice("Intelligence layer not initialized.");
			return;
		}
		optimizeBtn.disabled = true;
		optimizeBtn.textContent = "Pruning...";
		try {
			const result = await plugin.personaLoader.memoryStore.pruneDuplicates(0.7);
			const savedKb = ((result.bytesBefore - result.bytesAfter) / 1024).toFixed(1);
			optimizeResult.empty();
			optimizeResult.createEl("span", {
				text: `✅ Removed ${result.removed} duplicates (${result.groups} groups). Kept ${result.kept} unique entries. Saved ~${savedKb} KB.`,
				attr: { style: "color: var(--text-success);" },
			});
			new Notice(`Memory pruned: ${result.removed} duplicates removed, ~${savedKb} KB saved.`);
			void refreshStats();
		} catch (e: any) {
			optimizeResult.empty();
			optimizeResult.createEl("span", {
				text: `❌ Prune failed: ${e.message}`,
				attr: { style: "color: var(--text-error);" },
			});
			new Notice(`Prune failed: ${e.message}`);
		} finally {
			optimizeBtn.disabled = false;
			optimizeBtn.textContent = "🧹 Prune Duplicates";
		}
	});

	// ── Audit Log ──
	const auditEl = sectionEl.createEl("details", { cls: "obsidian-ai-settings-details" });

	const auditSummary = auditEl.createEl("summary", { text: "Memory Audit Log" });

	const auditContent = auditEl.createEl("div", { cls: "details-content" });

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
			auditContent.empty();
			for (const e of entries) {
				const time = new Date(e.timestamp).toLocaleString();
				const icon = e.operation === "create" ? "+" : e.operation === "update" ? "✎" : "−";
				const color = e.operation === "create" ? "var(--interactive-accent)" : e.operation === "update" ? "var(--text-normal)" : "var(--text-error)";
				const preview = e.content ? `"${e.content.slice(0, 60)}${e.content.length > 60 ? "…" : ""}"` : "";
				const line = auditContent.createEl("div", { cls: "obsidian-ai-audit-entry" });
				line.createEl("span", { text: time, attr: { style: "color: var(--text-muted);" } });
				line.appendText(" ");
				line.createEl("strong", { text: `${icon} ${e.operation}`, attr: { style: `color: ${color};` } });
				line.appendText(` [${e.entryId}] ${preview}`);
			}
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
