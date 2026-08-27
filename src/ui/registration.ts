// src/ui/registration.ts
import {
	MarkdownView,
	Notice,
	WorkspaceLeaf,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import {
	acceptTooltipEffect,
	commandEffect,
	dismissTooltipEffect,
	FloatingTooltipExtension,
} from "../modules/WidgetExtension";
import { generatedResponseState } from "../modules/AIExtension";
import {
	buildSelectionHiglightState,
	currentSelectionState,
	setSelectionInfoEffect,
} from "../modules/SelectionState";
import { diffExtension } from "../modules/diffExtension";
import { ObsidianAIChatView, CHAT_VIEWTYPE } from "../views/ObsidianAIChatView";
import {
	AvailableBuildsModal,
	PluginUpdater,
	UpdateAvailableModal,
} from "../updater/PluginUpdater";
import { GIT_COMMIT_HASH, GIT_BRANCH } from "../version-info";
import { ObsidianAISettingsTab } from "../settings-sections/SettingsTab";
import type ObsidianAIPlugin from "../main";

export const OPEN_CHAT_COMMAND_ID = "open-chat-lab-sidebar";
export const OPEN_CHAT_COMMAND_NAME = "Open Chat Lab AI sidebar";

export function registerChatView(plugin: ObsidianAIPlugin): void {
	plugin.registerView(
		CHAT_VIEWTYPE,
		(leaf) => new ObsidianAIChatView(leaf, plugin, {}),
	);
}

export function registerRibbonIcon(plugin: ObsidianAIPlugin): void {
	plugin.addRibbonIcon("message-square", "Open Chat Lab", () => {
		activateChatView(plugin);
	});
}

export function registerCommands(plugin: ObsidianAIPlugin): void {
	plugin.addCommand({
		id: "open-obsidian-ai-chat",
		name: "Open Chat Lab",
		callback: () => activateChatView(plugin),
	});

	// Add command to show tooltip
	plugin.addCommand({
		id: "show-cursor-tooltip",
		name: "Show cursor tooltip",
		callback: () => {
			const markdownView =
				plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView) {
				const cmEditor = (markdownView.editor as any)
					.cm as EditorView;

				// Grab the main selection range
				const { from, to } = cmEditor.state.selection.main;
				const effects = [];

				if (from !== to) {
					// If there is a real selection, store it
					const selectedText = cmEditor.state.doc.sliceString(
						from,
						to,
					);
					effects.push(
						setSelectionInfoEffect.of({
							from,
							to,
							text: selectedText,
						}),
					);
				} else {
					// If no selection, store cursor position instead of null
					effects.push(
						setSelectionInfoEffect.of({ from, to, text: "" }),
					);
				}

				// Also trigger the overlay
				effects.push(commandEffect.of(null));

				// Dispatch all effects in one go
				cmEditor.dispatch({ effects });
			}
		},
		hotkeys: [],
	});
	plugin.addCommand({
		id: "accept-tooltip",
		name: "Accept tooltip suggestion",
		callback: () => {
			const markdownView =
				plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView) {
				const cmEditor = (markdownView.editor as any)
					.cm as EditorView;

				const response = cmEditor.state.field(
					generatedResponseState,
					false,
				);
				if (response) {
					cmEditor.dispatch({
						effects: acceptTooltipEffect.of(null),
					});
					cmEditor.dispatch({
						effects: dismissTooltipEffect.of(null),
					});
				}
			}
		},
	});
	plugin.addCommand({
		id: "discard-tooltip",
		name: "Discard tooltip suggestion",
		callback: () => {
			const markdownView =
				plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (markdownView) {
				const cmEditor = (markdownView.editor as any)
					.cm as EditorView;
				const response = cmEditor.state.field(
					generatedResponseState,
					false,
				);
				if (response) {
					cmEditor.dispatch({
						effects: dismissTooltipEffect.of(null),
					});
				}
			}
		},
	});

	// Add manual update check command
	plugin.addCommand({
		id: "check-for-updates",
		name: "Check for updates",
		callback: () => checkForUpdates(plugin, true),
	});

	// T42e: Dry run command
	plugin.addCommand({
		id: "chat-sync-dry-run",
		name: "Chat Sync: Dry Run",
		callback: () => plugin.triggerSync(true),
	});

	// Command to clear debug log
	plugin.addCommand({
		id: "clear-debug-log",
		name: "Clear debug log file",
		callback: async () => {
			await plugin.logger.clear();
			new Notice("Debug log cleared.");
		},
	});
}

export function registerEditorExtensions(plugin: ObsidianAIPlugin): void {
	plugin.registerEditorExtension([
		FloatingTooltipExtension(plugin.chatapi, plugin),
		generatedResponseState,
		currentSelectionState,
		buildSelectionHiglightState,
		diffExtension,
	]);
}

export function registerSettingsTab(plugin: ObsidianAIPlugin): void {
	plugin.addSettingTab(new ObsidianAISettingsTab(plugin.app, plugin));
}

export function registerUpdater(plugin: ObsidianAIPlugin): void {
	// Initialize auto-updater (pass file logger so diagnostics go to debug.log)
	plugin._updater = new PluginUpdater(
		plugin.app,
		plugin.manifest.id,
		plugin.logger,
	);
	plugin.logger.log(
		"info",
		"[Main] PluginUpdater initialized, current commit:",
		GIT_COMMIT_HASH.slice(0, 7),
	);

	// Auto-check on startup (if enabled and not checked recently)
	if (plugin.settings.checkForUpdates) {
		const oneDay = 24 * 60 * 60 * 1000;
		const lastCheck = plugin.settings.lastUpdateCheck ?? 0;
		if (Date.now() - lastCheck > oneDay) {
			checkForUpdates(plugin, false);
		}
	}
}

export async function activateChatView(
	plugin: ObsidianAIPlugin,
): Promise<void> {
	if (plugin._chatViewActivation) {
		return plugin._chatViewActivation;
	}

	const activation = activateChatViewOnce(plugin);
	plugin._chatViewActivation = activation;

	try {
		await activation;
	} finally {
		if (plugin._chatViewActivation === activation) {
			plugin._chatViewActivation = null;
		}
	}
}

export async function activateChatViewOnce(
	plugin: ObsidianAIPlugin,
): Promise<void> {
	const { workspace } = plugin.app;
	let leaf = removeDuplicateChatLeaves(plugin);
	if (!leaf) {
		// Defensive: workspace restoration may still be in progress,
		// so the restored leaf might not yet appear in getLeavesOfType.
		// Wait one animation frame before falling back to creating a new leaf.
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => resolve()),
		);
		leaf = removeDuplicateChatLeaves(plugin);
	}
	if (!leaf) {
		leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: CHAT_VIEWTYPE, active: true });
	}
	workspace.setActiveLeaf(leaf, { focus: true });
}

/** Keep the focused chat leaf when possible and remove stale duplicate leaves. */
export function removeDuplicateChatLeaves(
	plugin: ObsidianAIPlugin,
): WorkspaceLeaf | undefined {
	const { workspace } = plugin.app;
	const leaves = workspace.getLeavesOfType(CHAT_VIEWTYPE);
	if (leaves.length === 0) return undefined;

	const activeLeaf = workspace.activeLeaf;
	const canonicalLeaf =
		activeLeaf && leaves.includes(activeLeaf) ? activeLeaf : leaves[0];

	for (const leaf of leaves) {
		if (leaf !== canonicalLeaf) {
			leaf.detach();
		}
	}

	return canonicalLeaf;
}

export async function openSessionInNewTab(
	plugin: ObsidianAIPlugin,
	sessionId: string,
	messageId: string,
): Promise<void> {
	// Session tabs are managed inside the existing chat view so the toolbar and
	// composer stay shared rather than creating stacked sidebar leaves.
	window.dispatchEvent(
		new CustomEvent("obsidian-ai:open-session", {
			detail: { sessionId, messageId },
		}),
	);
}

export async function checkForUpdates(
	plugin: ObsidianAIPlugin,
	manual: boolean,
) {
	if (!plugin._updater) return;

	try {
		const result = await plugin._updater.checkForUpdate(
			plugin.manifest.version,
			plugin.settings.updateChannel === "dev",
			GIT_COMMIT_HASH,
			GIT_BRANCH,
		);

		plugin.settings.lastUpdateCheck = Date.now();
		await plugin.saveSettings();

		if (!result.hasUpdate) {
			if (manual) {
				new Notice(
					`✅ Chat Lab is up to date (${result.currentVersion})`,
				);
			}
			return;
		}

		if (plugin.settings.autoUpdate && !result.isPrerelease) {
			// Auto-install stable updates
			new Notice(`📦 Downloading update ${result.latestVersion}…`);
			const tempDir = await plugin._updater.downloadUpdate(
				result.release!,
			);
			await plugin._updater.installUpdate(tempDir);
			new Notice(
				`✅ Update ${result.latestVersion} installed. Reload to apply.`,
			);
		} else {
			// Show modal for manual confirmation
			const modal = new UpdateAvailableModal(
				plugin.app,
				result,
				async () => {
					const tempDir = await plugin._updater!.downloadUpdate(
						result.release!,
					);
					await plugin._updater!.installUpdate(tempDir);
				},
			);
			modal.open();
		}
	} catch (error: any) {
		console.error("[ObsidianAI] Update check failed:", error);
		const isRateLimit =
			error?.status === 403 ||
			error?.message?.includes("rate limit") ||
			error?.message?.includes("API rate limit");
		if (manual) {
			if (isRateLimit) {
				new Notice(
					"❌ GitHub API rate limit exceeded. Try again in a few minutes.",
					6000,
				);
			} else {
				new Notice(
					`❌ Update check failed: ${error.message}`,
					5000,
				);
			}
		}
	}
}

export async function showAvailableBuilds(plugin: ObsidianAIPlugin) {
	if (!plugin._updater) return;

	const modal = new AvailableBuildsModal(
		plugin.app,
		plugin._updater,
		async (build) => {
			const tempDir = await plugin._updater!.downloadUpdate(
				build.release,
			);
			await plugin._updater!.installUpdate(tempDir);
		},
	);
	modal.open();
}
