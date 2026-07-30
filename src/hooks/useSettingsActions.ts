import { useState, useCallback } from "react";
import { Notice } from "obsidian";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { ProviderProfile } from "../settings";
import type { ChatApiManager } from "../api";
import type { ChatSession } from "../types";

interface UseSettingsActionsOptions {
	plugin: ChatPluginLike;
	autoNameSessions: boolean;
	setAutoNameSessions: React.Dispatch<React.SetStateAction<boolean>>;
	sessionsRef: React.MutableRefObject<ChatSession[]>;
	activeSessionIdRef: React.MutableRefObject<string | null>;
	manualRenameActiveSession: (
		resolvedProfile: ProviderProfile,
		chatapi: ChatApiManager,
	) => Promise<string | null>;
	resolvedProfile: ProviderProfile;
}

export interface UseSettingsActionsResult {
	autoApprove: boolean;
	setAutoApprove: React.Dispatch<React.SetStateAction<boolean>>;
	handleToggleAutoApprove: () => void;
	handleToggleAutoName: () => void;
	handleManualRename: () => Promise<void>;
}

export function useSettingsActions({
	plugin,
	autoNameSessions,
	setAutoNameSessions,
	sessionsRef,
	activeSessionIdRef,
	manualRenameActiveSession,
	resolvedProfile,
}: UseSettingsActionsOptions): UseSettingsActionsResult {
	const [autoApprove, setAutoApprove] = useState(plugin.settings.autoApply);

	const handleToggleAutoApprove = useCallback(() => {
		const newValue = !autoApprove;
		setAutoApprove(newValue);
		plugin.settings.autoApply = newValue;
		void plugin.saveSettings();
		new Notice(
			newValue
				? "🤖 Auto-approve ON — tool calls will run automatically"
				: "🔒 Manual mode — each tool call will ask for approval",
			2500,
		);
	}, [plugin, autoApprove]);

	const handleToggleAutoName = useCallback(() => {
		const newValue = !autoNameSessions;
		setAutoNameSessions(newValue);
		plugin.settings.autoNameSessions = newValue;
		void plugin.saveSettings();
		new Notice(
			newValue
				? "✨ Auto-name ON — sessions will be named automatically"
				: "✨ Auto-name OFF — sessions will not be named automatically",
			2500,
		);
	}, [plugin, autoNameSessions, setAutoNameSessions]);

	const handleManualRename = useCallback(async () => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		const session = sessionsRef.current.find(
			(s) => s.id === currentActiveId,
		);
		if (!session || session.messages.length === 0) {
			new Notice("No messages to generate a title from", 2000);
			return;
		}
		new Notice("🪄 Asking model for a title…", 1500);
		const title = await manualRenameActiveSession(
			resolvedProfile,
			plugin.chatapi,
		);
		if (title) {
			new Notice(`Session renamed to: "${title}"`, 2500);
		}
	}, [resolvedProfile, plugin.chatapi, manualRenameActiveSession, activeSessionIdRef, sessionsRef]);

	return {
		autoApprove,
		setAutoApprove,
		handleToggleAutoApprove,
		handleToggleAutoName,
		handleManualRename,
	};
}
