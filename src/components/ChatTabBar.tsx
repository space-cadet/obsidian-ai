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
	onCloseOthers: (sessionId: string) => void;
	onCloseToRight: (sessionId: string) => void;
	onRename: (sessionId: string, title: string) => void;
	tabTitleWidth?: number;
}

/** Special tab IDs that don't correspond to sessions */
const SPECIAL_TABS = new Set(["__sync__"]);

function isSpecialTab(id: string): boolean {
	return SPECIAL_TABS.has(id);
}

function getSpecialTabLabel(id: string): string {
	switch (id) {
		case "__sync__":
			return "🔄 Sync";
		default:
			return id;
	}
}

/** A lightweight tab strip for sessions within one shared chat view. */
const ChatTabBar: React.FC<ChatTabBarProps> = ({
	sessions,
	openSessionIds,
	activeSessionId,
	onSelect,
	onClose,
	onCloseOthers,
	onCloseToRight,
	onRename,
	tabTitleWidth = 160,
}) => {
	const tabListRef = useRef<HTMLDivElement>(null);

	// Build tab list including both sessions and special tabs
	const tabs = openSessionIds
		.map((id) => {
			if (isSpecialTab(id)) {
				return {
					id,
					type: "special" as const,
					label: getSpecialTabLabel(id),
				};
			}
			const session = sessions.find((s) => s.id === id);
			return session
				? {
						id,
						type: "session" as const,
						label: session.title || "New chat",
						session,
					}
				: null;
		})
		.filter(Boolean) as Array<
		| { id: string; type: "special"; label: string }
		| { id: string; type: "session"; label: string; session: ChatSession }
	>;

	// A restored desktop workspace can retain a prior horizontal scroll offset.
	// Begin every newly mounted tab strip at its first tab so no title starts offscreen.
	useEffect(() => {
		tabListRef.current?.scrollTo?.({ left: 0 });
	}, []);

	if (tabs.length === 0) return null;

	return (
		<div
			ref={tabListRef}
			className="chat-session-tabs"
			role="tablist"
			style={
				{
					"--chat-tab-title-width": `${tabTitleWidth}px`,
				} as React.CSSProperties
			}
		>
			{tabs.map((tab) => {
				const active = tab.id === activeSessionId;
				const isSpecial = tab.type === "special";
				return (
					<div
						key={tab.id}
						className={`chat-session-tab${active ? " is-active" : ""}${isSpecial ? " is-special" : ""}`}
						role="presentation"
					>
						<button
							className="chat-session-tab-select"
							role="tab"
							aria-selected={active}
							aria-label={tab.label}
							onClick={() => onSelect(tab.id)}
							title={tab.label}
							onContextMenu={(event) => {
								if (isSpecial) return;
								event.preventDefault();
								const menu = new Menu();
								menu.addItem((item) =>
									item
										.setTitle("Close tab")
										.setIcon("x")
										.onClick(() => onClose(tab.id)),
								);
								menu.addSeparator();
								menu.addItem((item) =>
									item
										.setTitle("Close other tabs")
										.setIcon("panel-right-close")
										.onClick(() => onCloseOthers(tab.id)),
								);
								menu.addItem((item) =>
									item
										.setTitle("Close tabs to the right")
										.setIcon("chevrons-right")
										.onClick(() => onCloseToRight(tab.id)),
								);
								menu.addSeparator();
								menu.addItem((item) =>
									item
										.setTitle("Rename session")
										.setIcon("pencil")
										.onClick(() => {
											const renamed = window.prompt(
												"Session title",
												tab.label,
											);
											if (renamed?.trim())
												onRename(tab.id, renamed);
										}),
								);
								menu.showAtMouseEvent(event.nativeEvent);
							}}
						>
							<span className="chat-session-tab-label" dir="ltr">
								{tab.label}
							</span>
						</button>
						{!isSpecial && (
							<button
								className="chat-session-tab-close"
								onClick={() => onClose(tab.id)}
								aria-label={`Close ${tab.label}`}
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
