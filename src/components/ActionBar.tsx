import React from "react";
import { ChatPluginLike } from "../views/ObsidianAIChatView";

interface ActionBarProps {
	onNewChat: () => void;
	onLoadChat: () => void;
	canLoad: boolean;
	plugin: ChatPluginLike;
	autoApprove: boolean;
	onToggleAutoApprove: () => void;
	autoNameSessions: boolean;
	onToggleAutoName: () => void;
	onManualRename: () => void;
}

const ActionBar: React.FC<ActionBarProps> = ({
	onNewChat,
	onLoadChat,
	canLoad,
	plugin,
	autoApprove,
	onToggleAutoApprove,
	autoNameSessions,
	onToggleAutoName,
	onManualRename,
}) => {
	const openSettings = () => {
		(plugin.app as any).setting.open();
		(plugin.app as any).setting.openTabById(plugin.manifest.id);
	};

	return (
		<div className="chat-action-bar">
			<button className="chat-btn chat-icon-btn" onClick={onNewChat} title="New chat">
				+
			</button>
			<button
				className="chat-btn chat-icon-btn"
				onClick={onLoadChat}
				disabled={!canLoad}
				title={canLoad ? "Load previous session" : "No saved sessions"}
			>
				↺
			</button>
			<button
				className={`chat-btn chat-icon-btn ${autoApprove ? "is-active" : ""}`}
				onClick={onToggleAutoApprove}
				title={
					autoApprove
						? "🤖 Auto-approve ON"
						: "🔒 Manual approval"
				}
			>
				{autoApprove ? "🤖" : "🔒"}
			</button>
			<button
				className={`chat-btn chat-icon-btn ${autoNameSessions ? "is-active" : ""}`}
				onClick={onToggleAutoName}
				title={
					autoNameSessions
						? "✨ Auto-name ON"
						: "✨ Auto-name OFF"
				}
			>
				{autoNameSessions ? "✨" : "✍"}
			</button>
			<button
				className="chat-btn chat-icon-btn"
				onClick={onManualRename}
				title="Rename session"
			>
				🪄
			</button>
			<button
				className="chat-btn chat-icon-btn"
				onClick={openSettings}
				title="Settings"
			>
				⚙
			</button>
		</div>
	);
};

export default ActionBar;
