import React from "react";
import type { App } from "obsidian";
import type {
	ChatMessage,
	ContentPart,
	ContextItem,
	Attachment,
	ThinkingMode,
} from "../types";
import type { ToolCall } from "../agent/types";
import type { ToolDisplayDescriptor } from "../agent/toolRegistry";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import PendingToolCard from "./presentational/PendingToolCard";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { ThinkingModeOption } from "../api/thinkingModes";

interface ChatMainAreaProps {
	app: App;
	renderMarkdown: (
		markdown: string,
		target: HTMLElement,
		sourcePath?: string,
	) => Promise<void>;
	plugin: ChatPluginLike;
	showFirstRunSplash: boolean;
	sessionId: string | null;
	contextItems: ContextItem[];
	messages: ChatMessage[];
	currentAiMessage: string;
	currentContentParts: ContentPart[];
	isStreaming: boolean;
	debugMode: boolean;
	isEditing: boolean;
	thinkingEnabled: boolean;
	thinkingMode: ThinkingMode;
	thinkingModeOptions: ThinkingModeOption[];
	showThinking: boolean;
	scrollToMessageId?: string;
	restoreScrollTop?: number;
	pendingToolCall: ToolCall | null;
	pendingToolDisplay: ToolDisplayDescriptor | null;
	typingUsers: string[];
	onSend: (
		text: string,
		attachments?: Attachment[],
	) => void | boolean | Promise<void | boolean>;
	onStop: () => void;
	onTyping: () => void;
	onAddMention: (item: ContextItem) => void;
	onCancelEdit: () => void;
	onThinkingModeChange: (mode: ThinkingMode) => void;
	onAppend: (text: string) => void;
	onInsertAtCursor: (text: string) => void;
	onApply: (text: string) => void;
	onRetry: (messageId: string) => void;
	onEditMessage: (messageId: string) => void;
	onApplyToTarget: (content: string, target: string) => void;
	onCreateNote: (content: string, target: string) => void;
	onAppendToTarget: (content: string, target: string) => void;
	onOpenPastSession: (sessionId: string, messageId?: string) => void;
	onScrollPositionChange: (sessionId: string, scrollTop: number) => void;
	onApproveTool: () => void;
	onRejectTool: () => void;
	attachments: Attachment[];
	onAttachmentsChange: (attachments: Attachment[]) => void;
	pressEnterToSend: boolean;
	tokenTotal?: string;
	draft?: string;
	onDraftChange?: (text: string) => void;
	editMessage?: string;
	selectionMode?: boolean;
	selectedMessageIds?: Set<string>;
	onLongPress?: (messageId: string) => void;
	onToggleSelection?: (messageId: string) => void;
}

const ChatMainArea: React.FC<ChatMainAreaProps> = ({
	app,
	renderMarkdown,
	plugin,
	showFirstRunSplash,
	sessionId,
	contextItems,
	messages,
	currentAiMessage,
	currentContentParts,
	isStreaming,
	debugMode,
	isEditing,
	thinkingEnabled,
	thinkingMode,
	thinkingModeOptions,
	showThinking,
	scrollToMessageId,
	restoreScrollTop,
	pendingToolCall,
	pendingToolDisplay,
	typingUsers,
	onSend,
	onStop,
	onTyping,
	onAddMention,
	onCancelEdit,
	onThinkingModeChange,
	onAppend,
	onInsertAtCursor,
	onApply,
	onRetry,
	onEditMessage,
	onApplyToTarget,
	onCreateNote,
	onAppendToTarget,
	onOpenPastSession,
	onScrollPositionChange,
	onApproveTool,
	onRejectTool,
	attachments,
	onAttachmentsChange,
	pressEnterToSend,
	tokenTotal,
	draft,
	onDraftChange,
	editMessage,
	selectionMode,
	selectedMessageIds,
	onLongPress,
	onToggleSelection,
}) => {
	const splashImageSrc = app.vault.adapter.getResourcePath(
		`${app.vault.configDir}/plugins/${plugin.manifest.id}/assets/chat-lab-splash-v1.8.0.png`,
	);

	return (
		<>
			{debugMode && (
				<div
					className="chat-debug-mode-indicator"
					role="status"
					aria-label="Debug mode active"
					title="Debug mode is active. Selected telemetry details will be available in session exports."
				>
					<span aria-hidden="true">●</span> Debug mode active
				</div>
			)}
			<ChatMessages
				sessionId={sessionId}
				restoreScrollTop={restoreScrollTop}
				onScrollPositionChange={onScrollPositionChange}
				messages={messages}
				currentAiMessage={currentAiMessage}
				currentContentParts={currentContentParts}
				isStreaming={isStreaming}
				isEditing={isEditing}
				app={app}
				splashImageSrc={splashImageSrc}
				showFirstRunSplash={showFirstRunSplash}
				renderMarkdown={renderMarkdown}
				showThinking={showThinking}
				onAppend={onAppend}
				onInsertAtCursor={onInsertAtCursor}
				onApply={onApply}
				onRetry={onRetry}
				onEdit={onEditMessage}
				onApplyToTarget={onApplyToTarget}
				onCreateNote={onCreateNote}
				onAppendToTarget={onAppendToTarget}
				onOpenPastSession={onOpenPastSession}
				scrollToMessageId={scrollToMessageId}
				typingUsers={typingUsers}
				selectionMode={selectionMode}
				selectedMessageIds={selectedMessageIds}
				onLongPress={onLongPress}
				onToggleSelection={onToggleSelection}
			/>
			{pendingToolCall && (
				<PendingToolCard
					toolCall={pendingToolCall}
					onApprove={onApproveTool}
					onReject={onRejectTool}
					toolDisplay={pendingToolDisplay}
				/>
			)}
			<ChatInput
				key={sessionId ?? "new-chat"}
				app={app}
				plugin={plugin}
				contextItems={contextItems}
				onSend={onSend}
				onStop={onStop}
				onTyping={onTyping}
				onAddMention={onAddMention}
				isStreaming={isStreaming}
				isEditing={isEditing}
				onCancel={onCancelEdit}
				editMessage={editMessage}
				thinkingEnabled={thinkingEnabled}
				thinkingMode={thinkingMode}
				thinkingModeOptions={thinkingModeOptions}
				onThinkingModeChange={onThinkingModeChange}
				attachments={attachments}
				onAttachmentsChange={onAttachmentsChange}
				pressEnterToSend={pressEnterToSend}
				tokenTotal={tokenTotal}
				draft={draft}
				onDraftChange={onDraftChange}
			/>
		</>
	);
};

export default React.memo(ChatMainArea);
