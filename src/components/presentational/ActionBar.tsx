import React from "react";
import { ChatPluginLike } from "../../views/ObsidianAIChatView";
import type { ProviderProfile } from "../../settings";
import ObsidianIcon from "../ObsidianIcon";
import ProfileIndicator from "./ProfileIndicator";

interface ActionBarProps {
	onNewChat: () => void;
	onLoadChat: () => void;
	onExportChat: () => void;
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
	searchVisible?: boolean;
	onToggleSearch?: () => void;
	relayEnabled?: boolean;
	onToggleRelay?: () => void;
	connectedUsers?: string[];
	onToggleRemoteUserDropdown?: () => void;
	remoteUserCount?: number;
}

const ActionBar: React.FC<ActionBarProps> = ({
	onNewChat,
	onLoadChat,
	onExportChat,
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
	searchVisible,
	onToggleSearch,
	relayEnabled,
	onToggleRelay,
	connectedUsers,
	onToggleRemoteUserDropdown,
	remoteUserCount,
}) => {
	const openSettings = () => {
		(plugin.app as any).setting.open();
		(plugin.app as any).setting.openTabById(plugin.manifest.id);
	};

	return (
		<div className="chat-action-bar">
			<div className="chat-action-bar-left">
				<button
					className="chat-btn chat-icon-btn"
					onClick={onNewChat}
					title="New chat"
				>
					<ObsidianIcon icon="plus" size={15} />
				</button>
				<button
					data-testid="history-button"
					className="chat-btn chat-icon-btn"
					onClick={onLoadChat}
					disabled={!canLoad}
					title={
						canLoad ? "Load previous session" : "No saved sessions"
					}
				>
					<ObsidianIcon icon="history" size={15} />
				</button>
				<button
					className="chat-btn chat-icon-btn"
					onClick={onExportChat}
					title="Export chat sessions"
				>
					<ObsidianIcon icon="download" size={15} />
				</button>
				{onToggleParticipantDropdown && (
					<div className="chat-council-trigger">
						<button
							className={`chat-btn chat-icon-btn ${(participantCount ?? 0) > 0 ? "is-active" : ""}`}
							onClick={onToggleParticipantDropdown}
							title={
								(participantCount ?? 0) > 0
									? `${participantCount} agents in chat`
									: "Group Chat"
							}
						>
							<ObsidianIcon icon="users" size={15} />
							<span className="chat-council-badge">
								{participantCount ?? 0}
							</span>
						</button>
					</div>
				)}
				{onToggleRemoteUserDropdown && (
					<div className="chat-remote-users-trigger">
						<button
							className={`chat-btn chat-icon-btn ${relayEnabled ? "is-active" : ""}`}
							onClick={onToggleRemoteUserDropdown}
							title={
								connectedUsers?.length
									? `Room: ${connectedUsers.join(", ")}`
									: "Room (offline)"
							}
						>
							<ObsidianIcon
								icon={relayEnabled ? "radio" : "globe"}
								size={15}
							/>
							<span className="chat-remote-users-badge">
								{remoteUserCount ?? 0}
							</span>
						</button>
					</div>
				)}
				{onToggleDebateMode && (participantCount ?? 0) >= 2 && (
					<button
						className={`chat-btn chat-icon-btn ${debateMode ? "is-active" : ""}`}
						onClick={onToggleDebateMode}
						title={
							debateMode
								? "🗣️ Debate mode ON"
								: "🗣️ Debate mode OFF"
						}
					>
						<ObsidianIcon
							icon={
								debateMode ? "message-circle" : "message-square"
							}
							size={15}
						/>
					</button>
				)}
				<button
					className={`chat-btn chat-icon-btn ${autoApprove ? "is-active" : ""}`}
					onClick={onToggleAutoApprove}
					title={
						autoApprove
							? "🤖 Auto-approve ON"
							: "🔒 Manual approval"
					}
				>
					<ObsidianIcon
						icon={autoApprove ? "bot" : "lock"}
						size={15}
					/>
				</button>
				{onToggleRelay && (
					<button
						className={`chat-btn chat-icon-btn ${relayEnabled ? "is-active" : ""}`}
						onClick={onToggleRelay}
						title={
							relayEnabled
								? "🔌 Relay connected"
								: "🔌 Relay disconnected"
						}
					>
						<ObsidianIcon
							icon={relayEnabled ? "plug" : "plug-zap"}
							size={15}
						/>
					</button>
				)}
				<button
					className={`chat-btn chat-icon-btn ${autoNameSessions ? "is-active" : ""}`}
					onClick={onToggleAutoName}
					title={
						autoNameSessions
							? "✨ Auto-name ON"
							: "✨ Auto-name OFF"
					}
				>
					<ObsidianIcon
						icon={autoNameSessions ? "sparkles" : "type"}
						size={15}
					/>
				</button>
				<button
					className="chat-btn chat-icon-btn"
					onClick={onManualRename}
					title="Rename session"
				>
					<ObsidianIcon icon="wand-2" size={15} />
				</button>
				{onToggleSearch && (
					<button
						className={`chat-btn chat-icon-btn ${searchVisible ? "is-active" : ""}`}
						onClick={onToggleSearch}
						title={searchVisible ? "Hide search" : "Search chats"}
					>
						<ObsidianIcon icon="search" size={15} />
					</button>
				)}
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
					<span
						className="chat-session-title-display"
						title={sessionTitle}
					>
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
						<ObsidianIcon
							icon={zenMode ? "eye-off" : "eye"}
							size={15}
						/>
					</button>
				)}
				<ProfileIndicator profile={profile} />
			</div>
		</div>
	);
};

export default ActionBar;
