import React from "react";
import { ChatSession } from "../types";
import ObsidianIcon from "./ObsidianIcon";

interface ChatTabBarProps {
	sessions: ChatSession[];
	openSessionIds: string[];
	activeSessionId: string | null;
	onSelect: (sessionId: string) => void;
	onClose: (sessionId: string) => void;
}

/** A lightweight tab strip for sessions within one shared chat view. */
const ChatTabBar: React.FC<ChatTabBarProps> = ({
	sessions,
	openSessionIds,
	activeSessionId,
	onSelect,
	onClose,
}) => {
	const openSessions = openSessionIds
		.map((id) => sessions.find((session) => session.id === id))
		.filter((session): session is ChatSession => Boolean(session));

	if (openSessions.length === 0) return null;

	return (
		<div className="chat-session-tabs" role="tablist" aria-label="Chat sessions">
			{openSessions.map((session) => {
				const active = session.id === activeSessionId;
				const title = session.title || "New chat";
				return (
					<div
						key={session.id}
						className={`chat-session-tab${active ? " is-active" : ""}`}
						role="tab"
						aria-selected={active}
					>
						<button
							className="chat-session-tab-select"
							onClick={() => onSelect(session.id)}
							title={title}
						>
							{title}
						</button>
						{openSessions.length > 1 && (
							<button
								className="chat-session-tab-close"
								onClick={() => onClose(session.id)}
								aria-label={`Close ${title}`}
								title="Close tab"
							>
								<ObsidianIcon icon="x" size={13} />
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
};

export default ChatTabBar;
