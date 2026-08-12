import React from "react";
import type { App } from "obsidian";
import type { ChatMessage, ContentPart, ContextItem, Attachment } from "../types";
import type { ToolCall } from "../agent/types";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import PendingToolCard from "./presentational/PendingToolCard";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";

interface ChatMainAreaProps {
	app: App;
	renderMarkdown: (markdown: string, target: HTMLElement, sourcePath?: string) => Promise<void>;
	plugin: ChatPluginLike;
	sessionId: string | null;
	messages: ChatMessage[];
	currentAiMessage: string;
	currentContentParts: ContentPart[];
	isStreaming: boolean;
	isEditing: boolean;
	thinkingEnabled: boolean;
	showThinking: boolean;
	scrollToMessageId?: string;
	restoreScrollTop?: number;
	pendingToolCall: ToolCall | null;
	pendingToolDisplay: { providerName: string; title: string; risk: string } | null;
	typingUsers: string[];
	onSend: (text: string, attachments?: Attachment[]) => void;
	onStop: () => void;
	onTyping: () => void;
	onAddMention: (item: ContextItem) => void;
	onCancelEdit: () => void;
	onToggleThinking: () => void;
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
}

const ChatMainArea: React.FC<ChatMainAreaProps> = ({
	app,
	renderMarkdown,
	plugin,
	sessionId,
	messages,
	currentAiMessage,
	currentContentParts,
	isStreaming,
	isEditing,
	thinkingEnabled,
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
	onToggleThinking,
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
}) => {
	return (
		<>
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
			/>
			{pendingToolCall && (
				<PendingToolCard
					toolCall={pendingToolCall}
					onApprove={onApproveTool}
					onReject={onRejectTool}
					providerDisplay={pendingToolDisplay}
				/>
			)}
			<ChatInput
				app={app}
				plugin={plugin}
				onSend={onSend}
				onStop={onStop}
				onTyping={onTyping}
				onAddMention={onAddMention}
				isStreaming={isStreaming}
				isEditing={isEditing}
				onCancel={onCancelEdit}
				editMessage={editMessage}
				thinkingEnabled={thinkingEnabled}
				onToggleThinking={onToggleThinking}
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
