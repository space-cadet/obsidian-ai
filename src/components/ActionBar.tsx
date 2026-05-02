import React from "react";
import { ChatPluginLike } from "../views/ObsidianAIChatView";

interface ActionBarProps {
	onNewChat: () => void;
	onLoadChat: () => void;
	canLoad: boolean;
	plugin: ChatPluginLike;
}

const ActionBar: React.FC<ActionBarProps> = ({
	onNewChat,
	onLoadChat,
	canLoad,
	plugin,
}) => {
	const openSettings = () => {
		(plugin.app as any).setting.open();
		(plugin.app as any).setting.openTabById(plugin.manifest.id);
	};

	return (
		<div className="chat-action-bar">
			<button className="chat-btn" onClick={onNewChat} title="New chat">
				+ New
			</button>
			<button
				className="chat-btn"
				onClick={onLoadChat}
				disabled={!canLoad}
				title={canLoad ? "Load a previous chat session" : "No saved sessions yet"}
			>
				↺ Load
			</button>
			<button
				className="chat-btn chat-settings-btn"
				onClick={openSettings}
				title="Settings"
			>
				⚙
			</button>
		</div>
	);
};

export default ActionBar;
