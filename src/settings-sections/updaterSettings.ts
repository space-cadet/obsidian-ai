import { Notice, Setting } from "obsidian";
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
	desc.textContent =
		"Automatically check for new versions from GitHub releases. " +
		"Stable releases are tested builds. Dev builds include the latest features but may be less stable.";

	// Check for updates toggle
	new Setting(section)
		.setName("Check for updates on startup")
		.addToggle((toggle) =>
			toggle
				.setValue(plugin.settings.checkForUpdates)
				.onChange(async (value) => {
					plugin.settings.checkForUpdates = value;
					await saveSettings({ quiet: true });
				}),
		);

	// Release channel dropdown
	new Setting(section).setName("Release channel").addDropdown((dropdown) =>
		dropdown
			.addOption("stable", "Stable")
			.addOption("dev", "Dev (pre-release)")
			.setValue(plugin.settings.updateChannel)
			.onChange(async (value) => {
				plugin.settings.updateChannel = value as "stable" | "dev";
				await saveSettings({ quiet: true });
			}),
	);

	// Auto-update toggle
	new Setting(section)
		.setName("Auto-install stable updates")
		.setDesc(
			"Automatically install stable updates without prompting. Disabled by default; downloaded files are backed up before installation. Dev builds always require confirmation.",
		)
		.addToggle((toggle) =>
			toggle
				.setValue(plugin.settings.autoUpdate)
				.onChange(async (value) => {
					plugin.settings.autoUpdate = value;
					await saveSettings({ quiet: true });
					if (value) {
						new Notice(
							"Auto-update enabled. Stable updates will install silently.",
						);
					}
				}),
		);

	// Version info + manual check
	const versionRow = section.createEl("div", { cls: "setting-item" });
	const versionInfo = versionRow.createEl("div", {
		cls: "setting-item-info",
	});
	versionInfo.createEl("div", {
		cls: "setting-item-name",
		text: "Current version",
	});
	const channelLabel =
		plugin.settings.updateChannel === "dev"
			? " (dev channel)"
			: " (stable)";
	versionInfo.createEl("div", {
		cls: "setting-item-description",
		text: `${plugin.manifest.version}${channelLabel}`,
	});

	const btnControl = versionRow.createEl("div", {
		cls: "setting-item-control",
	});
	const checkBtn = btnControl.createEl("button", {
		text: "Check Now",
		cls: "mod-cta",
	});
	checkBtn.addEventListener("click", async () => {
		checkBtn.setText("Checking…");
		checkBtn.disabled = true;
		await plugin.checkForUpdates(true);
		checkBtn.setText("Check Now");
		checkBtn.disabled = false;
	});

	// Last check info
	if (plugin.settings.lastUpdateCheck > 0) {
		const lastCheck = section.createEl("p", {
			cls: "setting-item-description",
		});
		const date = new Date(plugin.settings.lastUpdateCheck).toLocaleString();
		lastCheck.textContent = `Last checked: ${date}`;
	}
}
