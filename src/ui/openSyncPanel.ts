// src/ui/openSyncPanel.ts
import type ObsidianAIPlugin from "../main";

/**
 * Open the chat view focused on the sync tab (the two-step panel).
 *
 * ChatApp registers `openSyncTabNow` while mounted, so a mounted view
 * switches tabs directly. If the view is not open yet, set
 * `pendingSyncTabOpen` and activate the view — ChatApp's mount effect
 * consumes the flag. Dynamic import keeps this module out of
 * registration.ts's static import cycle with the settings tab.
 */
export async function openSyncPanel(plugin: ObsidianAIPlugin): Promise<void> {
	// Narrow a local, not the property: the property must stay un-narrowed
	// for the re-read after activation below.
	const openNow = plugin.openSyncTabNow;
	if (openNow) {
		openNow();
		return;
	}
	plugin.pendingSyncTabOpen = true;
	const { activateChatView } = await import("./registration");
	await activateChatView(plugin);
	// If ChatApp mounted during activation, take the request now.
	plugin.openSyncTabNow?.();
}
