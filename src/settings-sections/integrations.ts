import { ButtonComponent, Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderIntegrationsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: { refresh?: boolean; quiet?: boolean }) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Integrations",
		"Enable compatible peer plugins to offer their read-only tools to Obsidian AI. Provider credentials and configuration remain in the provider plugin.",
	);

	const refreshButton = new ButtonComponent(sectionEl)
		.setButtonText("Refresh integrations")
		.setTooltip("Discover compatible installed providers");
	refreshButton.buttonEl.addClass("mod-cta");
	refreshButton.onClick(() => {
		plugin.integrationRegistry.discover();
		void saveSettings({ refresh: true, quiet: true });
	});

	const providers = plugin.integrationRegistry.getStatuses();
	if (providers.length === 0) {
		sectionEl.createEl("p", {
			text: "No compatible integration providers are installed. Installed providers appear here after they expose a supported public API.",
			cls: "setting-item-description",
		});
		return;
	}

	for (const provider of providers) {
		const isToggleable = provider.status === "available" || provider.status === "disabled";
		new Setting(sectionEl)
			.setName(provider.displayName)
			.setDesc(`${provider.message} ${provider.capabilityCount} read-only tool${provider.capabilityCount === 1 ? "" : "s"} available.`)
			.addToggle((toggle) => {
				toggle
					.setValue(provider.enabled)
					.setDisabled(!isToggleable)
					.onChange(async (enabled) => {
						plugin.integrationRegistry.setEnabled(provider.id, enabled);
						await saveSettings({ refresh: true, quiet: true });
					});
			});
	}
}
