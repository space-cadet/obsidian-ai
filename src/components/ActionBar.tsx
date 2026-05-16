import React from "react";
import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { ProviderProfile } from "../settings";
import ObsidianIcon from "./ObsidianIcon";
import ProfileIndicator from "./ProfileIndicator";

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
	profile: ProviderProfile;
	sessionTitle?: string;
	zenMode?: boolean;
	onToggleZenMode?: () => void;
	participantCount?: number;
	onToggleParticipantDropdown?: () => void;
	debateMode?: boolean;
	onToggleDebateMode?: () => void;
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
	profile,
	sessionTitle,
	zenMode,
	onToggleZenMode,
	participantCount,
	onToggleParticipantDropdown,
	debateMode,
	onToggleDebateMode,
}) => {
	const openSettings = () => {
		(plugin.app as any).setting.open();
		(plugin.app as any).setting.openTabById(plugin.manifest.id);
	};

	return (
		<div className="chat-action-bar">
			<div className="chat-action-bar-left">
				<button className="chat-btn chat-icon-btn" onClick={onNewChat} title="New chat">
					<ObsidianIcon icon="plus" size={15} />
				</button>
				<button
					className="chat-btn chat-icon-btn"
					onClick={onLoadChat}
					disabled={!canLoad}
					title={canLoad ? "Load previous session" : "No saved sessions"}
				>
					<ObsidianIcon icon="history" size={15} />
				</button>
				{onToggleParticipantDropdown && (
					<div className="chat-council-trigger">
						<button
							className={`chat-btn chat-icon-btn ${participantCount && participantCount > 0 ? "is-active" : ""}`}
							onClick={onToggleParticipantDropdown}
							title={participantCount && participantCount > 0 ? `${participantCount} agents in council` : "AI Council"}
						>
							<ObsidianIcon icon="users" size={15} />
							{participantCount && participantCount > 0 && (
								<span className="chat-council-badge">{participantCount}</span>
							)}
						</button>
					</div>
				)}
				{onToggleDebateMode && participantCount && participantCount > 1 && (
					<button
						className={`chat-btn chat-icon-btn ${debateMode ? "is-active" : ""}`}
						onClick={onToggleDebateMode}
						title={debateMode ? "🗣️ Debate mode ON" : "🗣️ Debate mode OFF"}
					>
						<ObsidianIcon icon={debateMode ? "message-circle" : "message-square"} size={15} />
					</button>
				)}
				<button
					className={`chat-btn chat-icon-btn ${autoApprove ? "is-active" : ""}`}
					onClick={onToggleAutoApprove}
					title={autoApprove ? "🤖 Auto-approve ON" : "🔒 Manual approval"}
				>
					<ObsidianIcon icon={autoApprove ? "bot" : "lock"} size={15} />
				</button>
				<button
					className={`chat-btn chat-icon-btn ${autoNameSessions ? "is-active" : ""}`}
					onClick={onToggleAutoName}
					title={autoNameSessions ? "✨ Auto-name ON" : "✨ Auto-name OFF"}
				>
					<ObsidianIcon icon={autoNameSessions ? "sparkles" : "type"} size={15} />
				</button>
				<button
					className="chat-btn chat-icon-btn"
					onClick={onManualRename}
					title="Rename session"
				>
					<ObsidianIcon icon="wand-2" size={15} />
				</button>
				<button
					className="chat-btn chat-icon-btn"
					onClick={openSettings}
					title="Settings"
				>
					<ObsidianIcon icon="settings" size={15} />
				</button>
			</div>
			<div className="chat-action-bar-center">
				{sessionTitle && (
					<span className="chat-session-title-display" title={sessionTitle}>
						{sessionTitle}
					</span>
				)}
			</div>
			<div className="chat-action-bar-right">
				{onToggleZenMode && (
					<button
						className={`chat-btn chat-icon-btn ${zenMode ? "is-active" : ""}`}
						onClick={onToggleZenMode}
						title={zenMode ? "Exit zen mode" : "Zen mode (focus)"}
					>
						<ObsidianIcon icon={zenMode ? "eye-off" : "eye"} size={15} />
					</button>
				)}
				<ProfileIndicator profile={profile} />
			</div>
		</div>
	);
};

export default ActionBar;
