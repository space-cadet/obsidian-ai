import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { ProviderProfile } from "../settings";
import { getActiveProviderProfile } from "../settings";
import { renderAgentToolsSection } from "./agentTools";
import { renderAdvancedSection } from "./advanced";
import { renderChatDefaultsSection } from "./chatDefaults";
import { renderCustomCommandsSection } from "./customCommands";
import { renderDiagnosticsSection } from "./diagnostics";
import { renderHeroSection } from "./hero";
import { renderProviderProfilesSection } from "./providerProfiles";
import { renderIntelligenceSection } from "./intelligence";
import { renderIntegrationsSection } from "./integrations";
import { renderSyncComponentsSection } from "./syncComponents";
import { renderSyncSection } from "./syncSettings";
import { renderUpdaterSection } from "./updaterSettings";
import { renderWebSearchSection } from "./webSearch";
import { renderPdfExtractionSection } from "./pdfExtraction";
import { renderRemoteStorageSection } from "./remoteStorageSettings";
import { renderExportImportSection } from "./exportImport";
import { renderDebugModeSection } from "./debugMode";

function debounce(fn: () => void, ms: number): () => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => fn(), ms);
	};
}

function getScrollableAncestor(element: HTMLElement): HTMLElement | null {
	let ancestor = element.parentElement;
	while (ancestor) {
		const overflowY = window.getComputedStyle(ancestor).overflowY;
		if (
			(overflowY === "auto" || overflowY === "scroll") &&
			ancestor.scrollHeight > ancestor.clientHeight
		) {
			return ancestor;
		}
		ancestor = ancestor.parentElement;
	}
	return null;
}

interface SearchItem {
	label: string;
	description: string;
	sectionTitle: string;
	sectionId: string;
	settingEl: HTMLElement;
}

export class ObsidianAISettingsTab extends PluginSettingTab {
	plugin: ObsidianAIPlugin;
	private isDisplaying = false;
	private pendingRefresh = false;
	private debouncedProfileSave = debounce(() => {
		void this.saveSettings({ quiet: true });
	}, 250);

	constructor(app: App, plugin: ObsidianAIPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Check if a section is currently collapsed */
	private isCollapsed(sectionId: string): boolean {
		return this.plugin.settings.collapsedSections?.[sectionId] ?? false;
	}

	/** Toggle section collapse state and persist */
	private async toggleSection(
		sectionId: string,
		sectionEl: HTMLElement,
		collapsed: boolean,
	): Promise<void> {
		const sections = this.plugin.settings.collapsedSections ?? {};
		if (collapsed) {
			sections[sectionId] = true;
		} else {
			delete sections[sectionId];
		}
		this.plugin.settings.collapsedSections = sections;
		await this.plugin.saveSettings();

		sectionEl.toggleClass("is-collapsed", collapsed);
		const body = sectionEl.querySelector<HTMLElement>(
			".obsidian-ai-settings-section-body",
		);
		if (body) {
			body.toggleClass("is-hidden", collapsed);
		}
	}

	/** Expand or collapse all sections */
	private async setAllCollapsed(collapsed: boolean): Promise<void> {
		const sections = this.plugin.settings.collapsedSections ?? {};
		const containerEl = this.containerEl;
		containerEl
			.querySelectorAll<HTMLElement>(".obsidian-ai-settings-section")
			.forEach((sectionEl) => {
				const sectionId = sectionEl.id;
				if (!sectionId) return;
				if (collapsed) {
					sections[sectionId] = true;
				} else {
					delete sections[sectionId];
				}
				sectionEl.toggleClass("is-collapsed", collapsed);
				const body = sectionEl.querySelector<HTMLElement>(
					".obsidian-ai-settings-section-body",
				);
				if (body) {
					body.toggleClass("is-hidden", collapsed);
				}
				const btn = sectionEl.querySelector<HTMLElement>(
					".obsidian-ai-settings-section-toggle",
				);
				if (btn) {
					btn.setAttribute("aria-expanded", String(!collapsed));
					btn.textContent = collapsed ? "▸" : "▾";
				}
			});
		this.plugin.settings.collapsedSections = sections;
		await this.plugin.saveSettings();
	}

	private get activeProfile(): ProviderProfile {
		return getActiveProviderProfile(this.plugin.settings);
	}

	private async saveSettings(options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) {
		const refresh = options?.refresh ?? false;
		const quiet = options?.quiet ?? false;
		await this.plugin.saveSettings();
		this.plugin.chatapi.updateSettings(this.plugin.settings);
		window.dispatchEvent(new Event("obsidian-ai:settings-changed"));

		if (refresh) {
			if (this.isDisplaying) {
				this.pendingRefresh = true;
				return;
			}
			this.display();
			return;
		}

		if (!quiet) {
			new Notice("Settings saved", 1800);
		}
	}

	display(): void {
		this.isDisplaying = true;
		try {
			const { containerEl } = this;

			// Cleanup existing React roots before re-rendering
			containerEl
				.querySelectorAll(".obsidian-ai-settings-react-profiles")
				.forEach((el) => {
					const root = (el as any).__reactRoot;
					if (root) root.unmount();
				});

			containerEl.empty();
			containerEl.addClass("obsidian-ai-settings");

			renderHeroSection(containerEl, this.plugin);

			const discoveryControls = containerEl.createDiv({
				cls: "obsidian-ai-settings-discovery",
			});

			// ── Search with dropdown ──
			const searchWrap = discoveryControls.createDiv({
				cls: "obsidian-ai-settings-search",
			});
			searchWrap.createEl("label", {
				text: "Find a setting",
				attr: { for: "obsidian-ai-settings-search-input" },
			});
			searchWrap.createEl("div", {
				cls: "obsidian-ai-settings-search-hint",
				text: "Search setting names, descriptions, and sections.",
			});
			const searchInput = searchWrap.createEl("input", {
				cls: "obsidian-ai-settings-search-input",
				attr: {
					type: "search",
					id: "obsidian-ai-settings-search-input",
					placeholder: "Search settings…",
					autocomplete: "off",
					"aria-label": "Search settings",
					"aria-controls": "obsidian-ai-settings-search-dropdown",
					"aria-expanded": "false",
					"aria-autocomplete": "list",
				},
			});
			new Setting(discoveryControls)
				.setName("Show advanced settings")
				.setDesc(
					"Reveal diagnostics, developer controls, and other low-level configuration.",
				)
				.addToggle((toggle) => {
					toggle
						.setValue(this.plugin.settings.showAdvancedSettings)
						.onChange(async (value) => {
							this.plugin.settings.showAdvancedSettings = value;
							await this.saveSettings({ refresh: true });
						});
				});
			const searchDropdown = searchWrap.createEl("div", {
				cls: "obsidian-ai-settings-search-dropdown",
				attr: {
					id: "obsidian-ai-settings-search-dropdown",
					role: "listbox",
				},
			});

			const nav = containerEl.createEl("nav", {
				cls: "obsidian-ai-settings-toc",
				attr: { "aria-label": "Settings sections" },
			});
			const tocButtons: HTMLButtonElement[] = [];
			const advancedSectionTitles = new Set([
				"Advanced",
				"Debug Mode",
				"Diagnostics",
				"Sync Components",
			]);
			[
				["Provider Profiles", "Provider Profiles"],
				["Chat Defaults", "Chat Defaults"],
				["Agent Tools", "Agent Tools"],
				["Integrations", "Integrations"],
				["Intelligence", "AI Intelligence Layer"],
				["Web Search", "Web Search"],
				["Chat Relay", "Multi-User Chat Relay"],
				["Sync Components", "Sync Components"],
				["Remote Storage", "Remote Storage"],
				["Updates", "Updates"],
				["PDF Extraction", "PDF Extraction"],
				["Advanced", "Advanced"],
				["Custom Commands", "Custom Commands"],
				["Backup & Restore", "Backup & Restore"],
				["Debug Mode", "Debug Mode"],
				["Diagnostics", "Diagnostics"],
			].forEach(([label, sectionTitle]) => {
				if (
					advancedSectionTitles.has(sectionTitle) &&
					!this.plugin.settings.showAdvancedSettings
				) {
					return;
				}
				const id = `obsidian-ai-settings-${sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
				const button = nav.createEl("button", {
					text: label,
					attr: { type: "button" },
				});
				button.dataset.sectionId = id;
				button.addEventListener("click", (event) => {
					event.preventDefault();
					const section = containerEl.querySelector<HTMLElement>(
						`#${id}`,
					);
					if (!section) return;
					const scrollContainer = getScrollableAncestor(containerEl);
					if (scrollContainer) {
						const top =
							section.getBoundingClientRect().top -
							scrollContainer.getBoundingClientRect().top +
							scrollContainer.scrollTop -
							12;
						scrollContainer.scrollTo({ top, behavior: "smooth" });
					} else {
						section.scrollIntoView({
							behavior: "smooth",
							block: "start",
						});
					}
				});
				tocButtons.push(button);
			});

			// Collect search items after rendering
			const searchItems: SearchItem[] = [];

			function registerSearchItems(
				sectionEl: HTMLElement,
				sectionTitle: string,
			) {
				const sectionId = sectionEl.id;
				sectionEl
					.querySelectorAll<HTMLElement>(".setting-item")
					.forEach((settingEl) => {
						const nameEl =
							settingEl.querySelector<HTMLElement>(
								".setting-item-name",
							);
						const descriptionEl =
							settingEl.querySelector<HTMLElement>(
								".setting-item-description",
							);
						if (nameEl) {
							searchItems.push({
								label: nameEl.textContent || "",
								description: descriptionEl?.textContent || "",
								sectionTitle,
								sectionId,
								settingEl,
							});
						}
					});
			}

			function renderDropdown(query: string) {
				searchDropdown.empty();
				if (!query) {
					searchDropdown.removeClass("is-visible");
					searchInput.setAttribute("aria-expanded", "false");
					return;
				}
				const q = query.toLowerCase();
				const matches = searchItems.filter(
					(item) =>
						item.label.toLowerCase().includes(q) ||
						item.description.toLowerCase().includes(q) ||
						item.sectionTitle.toLowerCase().includes(q),
				);
				if (matches.length === 0) {
					searchDropdown.removeClass("is-visible");
					searchInput.setAttribute("aria-expanded", "false");
					return;
				}
				searchDropdown.addClass("is-visible");
				searchInput.setAttribute("aria-expanded", "true");
				matches.forEach((item) => {
					const option = searchDropdown.createEl("div", {
						cls: "obsidian-ai-settings-search-option",
						attr: { role: "option", tabindex: "0" },
					});
					const labelSpan = option.createEl("span", {
						cls: "obsidian-ai-settings-search-option-label",
						text: item.label,
					});
					// Highlight matching text
					if (q) {
						const text = item.label;
						const lower = text.toLowerCase();
						const i = lower.indexOf(q);
						if (i >= 0) {
							labelSpan.empty();
							labelSpan.appendText(text.slice(0, i));
							labelSpan.createEl("mark", {
								text: text.slice(i, i + q.length),
							});
							labelSpan.appendText(text.slice(i + q.length));
						}
					}
					option.createEl("span", {
						cls: "obsidian-ai-settings-search-option-section",
						text: item.sectionTitle,
					});
					option.addEventListener("click", () => {
						searchInput.value = "";
						searchDropdown.removeClass("is-visible");
						searchInput.setAttribute("aria-expanded", "false");
						const section = containerEl.querySelector<HTMLElement>(
							`#${item.sectionId}`,
						);
						if (!section) return;
						// Unhide the section if it was hidden by search
						section.removeClass("is-search-hidden");
						// Scroll to the setting
						const scrollContainer =
							getScrollableAncestor(containerEl);
						if (scrollContainer) {
							const top =
								item.settingEl.getBoundingClientRect().top -
								scrollContainer.getBoundingClientRect().top +
								scrollContainer.scrollTop -
								12;
							scrollContainer.scrollTo({
								top,
								behavior: "smooth",
							});
						} else {
							item.settingEl.scrollIntoView({
								behavior: "smooth",
								block: "center",
							});
						}
						// Brief highlight
						item.settingEl.addClass("is-search-highlight");
						setTimeout(
							() =>
								item.settingEl.removeClass(
									"is-search-highlight",
								),
							2000,
						);
					});
					option.addEventListener("keydown", (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							option.click();
						}
					});
				});
			}

			searchInput.addEventListener("input", () => {
				const query = searchInput.value.trim();
				// Also update section visibility
				containerEl
					.querySelectorAll<HTMLElement>(
						".obsidian-ai-settings-section",
					)
					.forEach((section) => {
						section.toggleClass(
							"is-search-hidden",
							Boolean(query) &&
								!section.textContent
									?.toLocaleLowerCase()
									.includes(query.toLocaleLowerCase()),
						);
					});
				tocButtons.forEach((button) => {
					const section = containerEl.querySelector<HTMLElement>(
						`#${button.dataset.sectionId}`,
					);
					const matches =
						!query ||
						button.textContent
							?.toLocaleLowerCase()
							.includes(query.toLocaleLowerCase()) ||
						section?.textContent
							?.toLocaleLowerCase()
							.includes(query.toLocaleLowerCase());
					button.toggleClass("is-search-hidden", !matches);
				});
				renderDropdown(query);
			});

			// ── Expand / Collapse All ──
			const collapseWrap = containerEl.createDiv({
				cls: "obsidian-ai-settings-collapse-bar",
			});
			collapseWrap.createEl("span", { text: "Sections:" });
			const expandBtn = collapseWrap.createEl("button", {
				text: "Expand all",
				attr: { type: "button" },
			});
			const collapseBtn = collapseWrap.createEl("button", {
				text: "Collapse all",
				attr: { type: "button" },
			});
			expandBtn.addEventListener("click", () =>
				this.setAllCollapsed(false),
			);
			collapseBtn.addEventListener("click", () =>
				this.setAllCollapsed(true),
			);

			// Hide dropdown on outside click
			document.addEventListener("click", (e) => {
				if (!searchWrap.contains(e.target as Node)) {
					searchDropdown.removeClass("is-visible");
					searchInput.setAttribute("aria-expanded", "false");
				}
			});

			// Keyboard navigation for dropdown
			searchInput.addEventListener("keydown", (e) => {
				if (e.key === "Escape") {
					searchDropdown.removeClass("is-visible");
					searchInput.setAttribute("aria-expanded", "false");
					searchInput.blur();
					return;
				}
				if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
				const options =
					searchDropdown.querySelectorAll<HTMLElement>(
						"[role='option']",
					);
				if (options.length === 0) return;
				const active =
					searchDropdown.querySelector<HTMLElement>(".is-active");
				let idx = active ? Array.from(options).indexOf(active) : -1;
				if (e.key === "ArrowDown")
					idx = Math.min(idx + 1, options.length - 1);
				else idx = Math.max(idx - 1, 0);
				active?.removeClass("is-active");
				options[idx].addClass("is-active");
				options[idx].focus();
				e.preventDefault();
			});

			// ── Render sections ──
			const sections: { title: string; el: HTMLElement }[] = [];

			const addSection = (_el: void, title: string) => {
				const id = `obsidian-ai-settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
				const el = containerEl.querySelector<HTMLElement>(`#${id}`);
				if (!el) return;

				// Wrap existing section content in collapsible container
				const headerId = `${id}-header`;
				const bodyId = `${id}-body`;
				const collapsed = this.isCollapsed(id);

				// Create header row with toggle button
				const header = el.createEl("div", {
					cls: "obsidian-ai-settings-section-header",
					attr: { id: headerId },
				});
				// Move the existing heading into header
				const existingHeading =
					el.querySelector<HTMLElement>("h2, h3, h4");
				if (existingHeading) {
					header.appendChild(existingHeading);
				} else {
					new Setting(header).setName(title).setHeading();
				}
				const toggleBtn = header.createEl("button", {
					cls: "obsidian-ai-settings-section-toggle",
					text: collapsed ? "▸" : "▾",
					attr: {
						type: "button",
						"aria-expanded": String(!collapsed),
						"aria-controls": bodyId,
					},
				});
				toggleBtn.addEventListener("click", () => {
					const nowCollapsed = !el.hasClass("is-collapsed");
					void this.toggleSection(id, el, nowCollapsed);
					toggleBtn.setAttribute(
						"aria-expanded",
						String(!nowCollapsed),
					);
					toggleBtn.textContent = nowCollapsed ? "▸" : "▾";
				});

				// Wrap all existing children (except header) in body
				const body = el.createEl("div", {
					cls: "obsidian-ai-settings-section-body",
					attr: { id: bodyId },
				});
				// Move all non-header children into body
				Array.from(el.children).forEach((child) => {
					if (
						child !== header &&
						child !== body &&
						!(child as HTMLElement).hasClass(
							"obsidian-ai-settings-section-header",
						)
					) {
						body.appendChild(child);
					}
				});

				if (collapsed) {
					el.addClass("is-collapsed");
					body.addClass("is-hidden");
				}

				sections.push({ title, el });
				registerSearchItems(el, title);
			};

			const s1 = renderProviderProfilesSection(containerEl, this.plugin);
			addSection(s1, "Provider Profiles");

			const s2 = renderChatDefaultsSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s2, "Chat Defaults");

			const s3 = renderAgentToolsSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s3, "Agent Tools");

			const s4 = renderIntegrationsSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s4, "Integrations");

			const s5 = renderIntelligenceSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s5, "AI Intelligence Layer");

			const s6 = renderWebSearchSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s6, "Web Search");

			const s7 = renderPdfExtractionSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s7, "PDF Extraction");

			const s8 = renderSyncSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s8, "Multi-User Chat Relay");

			if (this.plugin.settings.showAdvancedSettings) {
				const s9 = renderSyncComponentsSection(
					containerEl,
					this.plugin,
					this.saveSettings.bind(this),
				);
				addSection(s9, "Sync Components");
			}

			const s10 = renderRemoteStorageSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s10, "Remote Storage");

			const s11 = renderUpdaterSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s11, "Updates");

			if (this.plugin.settings.showAdvancedSettings) {
				const s12 = renderAdvancedSection(
					containerEl,
					this.plugin,
					this.saveSettings.bind(this),
				);
				addSection(s12, "Advanced");
			}

			const s13 = renderCustomCommandsSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s13, "Custom Commands");

			const s14 = renderExportImportSection(
				containerEl,
				this.plugin,
				this.saveSettings.bind(this),
			);
			addSection(s14, "Backup & Restore");

			if (this.plugin.settings.showAdvancedSettings) {
				const s15 = renderDebugModeSection(
					containerEl,
					this.plugin,
					this.saveSettings.bind(this),
				);
				addSection(s15, "Debug Mode");

				const s16 = renderDiagnosticsSection(
					containerEl,
					this.plugin,
					this.app,
					this.saveSettings.bind(this),
				);
				addSection(s16, "Diagnostics");
			}
		} finally {
			this.isDisplaying = false;
			if (this.pendingRefresh) {
				this.pendingRefresh = false;
				this.display();
			}
		}
	}
}
