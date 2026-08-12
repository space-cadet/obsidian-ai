import React from "react";
import { ProviderProfile, getProviderColor } from "../../settings";
import ObsidianIcon from "../ObsidianIcon";

interface ProfileIndicatorProps {
	profile: ProviderProfile;
}

const providerIcons: Record<string, string> = {
	openai: "bot",
	anthropic: "bot-message-square",
	google: "bot",
	deepseek: "bot",
	ollama: "cpu",
	agent: "network",
};

export const ProfileIndicator: React.FC<ProfileIndicatorProps> = ({
	profile,
}) => {
	const iconName = providerIcons[profile.provider] || "bot";
	const color = getProviderColor(profile.provider);

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
