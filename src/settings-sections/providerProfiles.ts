import { createElement } from "react";
import { createRoot } from "react-dom/client";
import ObsidianAIPlugin from "../main";
import { createSection } from "./helpers";

export function renderProviderProfilesSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
): void {
	const sectionEl = createSection(
		containerEl,
		"Provider Profiles",
		"Store multiple provider configurations and switch between them without rewriting credentials.",
	);

	// Mount React profile list into a dedicated container
	const reactContainer = sectionEl.createDiv({
		cls: "obsidian-ai-settings-react-profiles",
	});

	const { ProfileList } = require("../components/ProfileCard");
	const { ChatErrorBoundary } = require("../components/presentational/ErrorBoundary");

	const root = createRoot(reactContainer);
	root.render(
		createElement(
			ChatErrorBoundary,
			null,
			createElement(ProfileList, { plugin }),
		),
	);

	// Store root so we can unmount on refresh
	(reactContainer as any).__reactRoot = root;
}
