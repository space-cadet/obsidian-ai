import { Notice } from "obsidian";
import ObsidianAIPlugin from "../main";

export function renderUpdaterSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (opts?: { quiet?: boolean }) => Promise<void>,
): void {
	const section = containerEl.createEl("div", {
		cls: "obsidian-ai-settings-section",
		attr: { id: "obsidian-ai-settings-updates" },
	});

	section.createEl("h2", { text: "Updates" });

	const desc = section.createEl("p", { cls: "setting-item-description" });
	desc.innerHTML =
		"Automatically check for new versions from GitHub releases. " +
		"Stable releases are tested builds. Dev builds include the latest features but may be less stable.";

	// Check for updates toggle
	const checkRow = section.createEl("div", { cls: "setting-item" });
	checkRow.createEl("div", { cls: "setting-item-info", text: "Check for updates on startup" });
	const checkControl = checkRow.createEl("div", { cls: "setting-item-control" });
	const checkToggle = checkControl.createEl("input", {
		type: "checkbox",
	});
	checkToggle.checked = plugin.settings.checkForUpdates;
	checkToggle.addEventListener("change", async () => {
		plugin.settings.checkForUpdates = checkToggle.checked;
		await saveSettings({ quiet: true });
	});

	// Update channel dropdown
	const channelRow = section.createEl("div", { cls: "setting-item" });
	channelRow.createEl("div", { cls: "setting-item-info", text: "Release channel" });
	const channelControl = channelRow.createEl("div", { cls: "setting-item-control" });
	const channelSelect = channelControl.createEl("select", {
		cls: "dropdown",
	});
	const stableOption = channelSelect.createEl("option", { text: "Stable", value: "stable" });
	const devOption = channelSelect.createEl("option", { text: "Dev (pre-release)", value: "dev" });
	channelSelect.value = plugin.settings.updateChannel;
	channelSelect.addEventListener("change", async () => {
		plugin.settings.updateChannel = channelSelect.value as "stable" | "dev";
		await saveSettings({ quiet: true });
	});

	// Auto-update toggle
	const autoRow = section.createEl("div", { cls: "setting-item" });
	autoRow.createEl("div", { cls: "setting-item-info", text: "Auto-install stable updates" });
	const autoControl = autoRow.createEl("div", { cls: "setting-item-control" });
	const autoToggle = autoControl.createEl("input", {
		type: "checkbox",
	});
	autoToggle.checked = plugin.settings.autoUpdate;
	autoToggle.addEventListener("change", async () => {
		plugin.settings.autoUpdate = autoToggle.checked;
		await saveSettings({ quiet: true });
		if (autoToggle.checked) {
			new Notice("Auto-update enabled. Stable updates will install silently.");
		}
	});

	// Manual check button
	const btnRow = section.createEl("div", { cls: "setting-item" });
	btnRow.createEl("div", { cls: "setting-item-info", text: "Current version" });
	const btnControl = btnRow.createEl("div", { cls: "setting-item-control" });
	btnControl.createEl("span", {
		text: plugin.manifest.version,
		cls: "setting-item-description",
	});
	const checkBtn = btnControl.createEl("button", {
		text: "Check Now",
		cls: "mod-cta",
	});
	checkBtn.style.marginLeft = "12px";
	checkBtn.addEventListener("click", async () => {
		checkBtn.setText("Checking…");
		checkBtn.disabled = true;
		await plugin.checkForUpdates(true);
		checkBtn.setText("Check Now");
		checkBtn.disabled = false;
	});

	// Last check info
	if (plugin.settings.lastUpdateCheck > 0) {
		const lastCheck = section.createEl("p", { cls: "setting-item-description" });
		const date = new Date(plugin.settings.lastUpdateCheck).toLocaleString();
		lastCheck.textContent = `Last checked: ${date}`;
	}
}
