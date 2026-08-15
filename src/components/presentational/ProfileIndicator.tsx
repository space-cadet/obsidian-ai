import React from "react";
import type { ProviderProfile } from "../../settings";
import ObsidianIcon from "../ObsidianIcon";

interface ProfileIndicatorProps {
	profile: ProviderProfile;
}

const providerIcons: Record<string, string> = {
	openai: "bot",
	anthropic: "bot-message-square",
	google: "bot",
	deepseek: "bot",
	agent: "network",
};

const providerColors: Record<string, string> = {
	openai: "#74aa9c",
	anthropic: "#d97757",
	google: "#4285f4",
	deepseek: "#4d6bfe",
	agent: "#a78bfa",
};

export const ProfileIndicator: React.FC<ProfileIndicatorProps> = ({
	profile,
}) => {
	const iconName = providerIcons[profile.provider] || "bot";
	const color = providerColors[profile.provider] ?? "#888888";

	return (
		<div className="chat-profile-chip" title={`${profile.name} — ${profile.provider} / ${profile.model}`}>
			<span
				className="chat-profile-chip-dot"
				style={{ background: color }}
			/>
			<ObsidianIcon icon={iconName} size={14} />
			<span className="chat-profile-chip-name">{profile.name}</span>
			<span className="chat-profile-chip-model">{profile.model}</span>
		</div>
	);
};

export default ProfileIndicator;
