import React from "react";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { ChatSession } from "../types";
import SessionPickerModal from "./presentational/SessionPickerModal";
import ExportModal from "./presentational/ExportModal";
import ContextPickerModal from "./ContextPickerModal";

interface ChatOverlaysProps {
	plugin: ChatPluginLike;
	savedSessions: ChatSession[];
	activeSessionId: string | null;
	showSessionPicker: boolean;
	showExportModal: boolean;
	showContextPicker: boolean;
	onLoadSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => void;
	onRenameSession: (sessionId: string, title: string) => void;
	onCloseSessionPicker: () => void;
	onCloseExportModal: () => void;
	onCloseContextPicker: () => void;
	onAddContextItems: (items: import("../types").ContextItem[]) => void;
}

const ChatOverlays: React.FC<ChatOverlaysProps> = ({
	plugin,
	savedSessions,
	activeSessionId,
	showSessionPicker,
	showExportModal,
	showContextPicker,
	onLoadSession,
	onDeleteSession,
	onRenameSession,
	onCloseSessionPicker,
	onCloseExportModal,
	onCloseContextPicker,
	onAddContextItems,
}) => {
	return (
		<>
			{showSessionPicker && (
				<SessionPickerModal
					sessions={savedSessions}
					activeSessionId={activeSessionId}
					onLoad={onLoadSession}
					onDelete={onDeleteSession}
					onRename={onRenameSession}
					onClose={onCloseSessionPicker}
				/>
			)}
			{showExportModal && (
				<ExportModal
					sessions={savedSessions}
					activeSessionId={activeSessionId}
					plugin={plugin}
					onClose={onCloseExportModal}
				/>
			)}
			{showContextPicker && (
				<ContextPickerModal
					plugin={plugin}
					app={plugin.app}
					onAdd={onAddContextItems}
					onClose={onCloseContextPicker}
				/>
			)}
		</>
	);
};

export default React.memo(ChatOverlays);
