import React, { useEffect, useRef } from "react";
import { Menu } from "obsidian";
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
	const tabListRef = useRef<HTMLDivElement>(null);
	const openSessions = openSessionIds
		.map((id) => sessions.find((session) => session.id === id))
		.filter((session): session is ChatSession => Boolean(session));

	// A restored desktop workspace can retain a prior horizontal scroll offset.
	// Begin every newly mounted tab strip at its first tab so no title starts offscreen.
	useEffect(() => {
		tabListRef.current?.scrollTo?.({ left: 0 });
	}, []);

	if (openSessions.length === 0) return null;

	return (
		<div ref={tabListRef} className="chat-session-tabs" role="tablist">
			{openSessions.map((session) => {
				const active = session.id === activeSessionId;
				const title = session.title || "New chat";
				return (
					<div
						key={session.id}
						className={`chat-session-tab${active ? " is-active" : ""}`}
						role="presentation"
					>
						<button
							className="chat-session-tab-select"
							role="tab"
							aria-selected={active}
							aria-label={title}
							onClick={() => onSelect(session.id)}
							title={title}
							onContextMenu={(event) => {
								event.preventDefault();
								const menu = new Menu();
								menu.addItem((item) =>
									item
										.setTitle("Close tab")
										.setIcon("x")
										.onClick(() => onClose(session.id)),
								);
								menu.showAtMouseEvent(event.nativeEvent);
							}}
						>
							{title}
						</button>
						<button
							className="chat-session-tab-close"
							onClick={() => onClose(session.id)}
							aria-label={`Close ${title}`}
							title="Close tab"
						>
							<ObsidianIcon icon="x" size={13} />
						</button>
					</div>
				);
			})}
		</div>
	);
};

export default ChatTabBar;
