import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderDebugModeSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Debug Mode",
		"Enable enhanced chat telemetry and choose which details are included in session exports. Debug mode is local to this plugin and is off by default.",
	);

	new Setting(sectionEl)
		.setName("Enable debug mode")
		.setDesc(
			"When enabled, the chat shows a Debug mode active indicator and exports can include the selected telemetry details.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.debugMode)
				.onChange(async (value) => {
					plugin.settings.debugMode = value;
					await saveSettings({ refresh: true });
				});
		});

	const telemetryGroup = sectionEl.createDiv({
		cls: "obsidian-ai-debug-telemetry-group",
	});
	telemetryGroup.createEl("h4", { text: "Export details" });
	telemetryGroup.createEl("p", {
		text: "Choose which diagnostic details are included when you export a session.",
		cls: "obsidian-ai-debug-telemetry-group-desc",
	});

	const addTelemetryToggle = (
		name: string,
		desc: string,
		key: keyof typeof plugin.settings.debugTelemetry,
	) => {
		new Setting(telemetryGroup)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) => {
				toggle
					.setValue(plugin.settings.debugTelemetry[key])
					.setDisabled(!plugin.settings.debugMode)
					.onChange(async (value) => {
						plugin.settings.debugTelemetry[key] = value;
						await saveSettings();
					});
			});
	};

	addTelemetryToggle(
		"Provider usage",
		"Include provider-reported input, output, cached-input, reasoning, and total token usage when available.",
		"includeProviderUsage",
	);
	addTelemetryToggle(
		"Request estimates",
		"Include the plugin's estimated request and message token counts.",
		"includeRequestEstimates",
	);
	addTelemetryToggle(
		"Per-step request breakdown",
		"Include per-model-step estimates for tool schemas, selected history, continuations, tool results, and provider usage.",
		"includeRequestBreakdown",
	);
	addTelemetryToggle(
		"Tool details",
		"Include tool names, call IDs, arguments, result status, and result sizes in the telemetry block.",
		"includeToolDetails",
	);
	addTelemetryToggle(
		"Context metadata",
		"Include the selected context item references without exporting resolved note contents again.",
		"includeContextMetadata",
	);
	addTelemetryToggle(
		"Model and timing",
		"Include the model name and response duration for each assistant message.",
		"includeModelTiming",
	);
}
