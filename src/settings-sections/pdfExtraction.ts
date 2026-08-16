import { Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderPdfExtractionSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"PDF Extraction",
		"Configure how the AI extracts text from PDF documents.",
	);

	new Setting(sectionEl)
		.setName("Extraction method")
		.setDesc(
			"Choose how PDF text is extracted. " +
				"Server-side uses PyMuPDF on a remote endpoint (faster, better quality). " +
				"Client-side uses pdfjs-dist within Obsidian (works offline). " +
				"Auto tries server first, falls back to client.",
		)
		.addDropdown((dropdown) =>
			dropdown
				.addOption("auto", "Auto (server preferred, client fallback)")
				.addOption("server", "Server-side only")
				.addOption("client", "Client-side only (offline)")
				.setValue(plugin.settings.pdfExtractionMethod)
				.onChange(async (value) => {
					plugin.settings.pdfExtractionMethod = value as
						| "auto"
						| "server"
						| "client";
					await saveSettings({ refresh: true, quiet: true });
				}),
		);

	// Server URL (shown when not client-only)
	if (plugin.settings.pdfExtractionMethod !== "client") {
		new Setting(sectionEl)
			.setName("Server endpoint URL")
			.setDesc(
				"The PDF extraction service URL. " +
					"Default uses the built-in relay endpoint. " +
					"You can self-host the extraction service for privacy.",
			)
			.addText((text) => {
				text.setPlaceholder(
					"https://quantumofgravity.com/relay/pdf-extract/",
				)
					.setValue(plugin.settings.pdfExtractionServerUrl)
					.inputEl.addEventListener("blur", async () => {
						plugin.settings.pdfExtractionServerUrl = text
							.getValue()
							.trim();
						await saveSettings();
					});
			});
	}

	new Setting(sectionEl)
		.setName("Maximum pages")
		.setDesc(
			"Maximum number of pages to extract from a PDF. " +
				"Lower values save tokens and speed up extraction. " +
				"Set to 0 for no limit (extract all pages).",
		)
		.addSlider((slider) =>
			slider
				.setLimits(0, 200, 10)
				.setValue(plugin.settings.pdfMaxPages)
				.setDynamicTooltip()
				.onChange(async (value) => {
					plugin.settings.pdfMaxPages = value;
					await saveSettings({ quiet: true });
				}),
		);
}
