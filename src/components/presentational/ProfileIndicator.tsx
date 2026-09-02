import React from "react";
import type { ProviderProfile } from "../../settings";

interface ProfileIndicatorProps {
	profile: ProviderProfile;
}

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
	const color = providerColors[profile.provider] ?? "#888888";

	return (
		<div
			className="chat-profile-chip"
			title={`${profile.name} — ${profile.provider} / ${profile.model}`}
		>
			<span
				className="chat-profile-chip-dot"
				style={{ background: color }}
			/>
			<span className="chat-profile-chip-provider">
				{profile.provider}
			</span>
			<span className="chat-profile-chip-model">{profile.model}</span>
		</div>
	);
};

export default ProfileIndicator;
