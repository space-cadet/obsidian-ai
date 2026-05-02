import React, { useState, useCallback } from "react";

interface ChatInputProps {
	onSend: (text: string) => void;
	onStop: () => void;
	isStreaming: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
	onSend,
	onStop,
	isStreaming,
}) => {
	const [value, setValue] = useState("");

	const submit = useCallback(() => {
		if (isStreaming) {
			onStop();
		} else if (value.trim()) {
			onSend(value.trim());
			setValue("");
		}
	}, [value, isStreaming, onSend, onStop]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				submit();
			}
		},
		[submit],
	);

	return (
		<div className="chat-input-area">
			<textarea
				className="chat-textarea"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Ask anything... (Shift+Enter for new line)"
				rows={2}
			/>
			<button
				className={`chat-btn chat-send-btn${isStreaming ? " chat-stop-btn" : ""}`}
				onClick={submit}
				title={isStreaming ? "Stop" : "Send"}
			>
				{isStreaming ? "⏹ Stop" : "↑ Send"}
			</button>
		</div>
	);
};

export default ChatInput;
