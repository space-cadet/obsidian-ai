// src/ui/events.ts
import type ObsidianAIPlugin from "../main";
import { removeDuplicateChatLeaves } from "./registration";

export function setupEventHandlers(plugin: ObsidianAIPlugin): void {
	// A previous desktop race could have persisted more than one chat leaf in
	// the workspace. Reconcile restored layouts once they are fully available.
	plugin.app.workspace.onLayoutReady(() => {
		plugin.integrationRegistry.discover();
		removeDuplicateChatLeaves(plugin);
	});
}
