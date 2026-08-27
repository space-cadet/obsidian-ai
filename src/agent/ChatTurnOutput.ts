import type { ContentPart } from "../types";
import type { ToolCall, ToolResult } from "./types";

export interface ChatTurnOutputSnapshot {
	text: string;
	toolCalls: Array<{ call: ToolCall; result?: ToolResult }>;
	contentParts: ContentPart[];
}

/** Collect the model output for one turn without knowing about the UI. */
export class ChatTurnOutput {
	private text = "";
	private textCheckpoint = 0;
	private toolCalls: Array<{ call: ToolCall; result?: ToolResult }> = [];
	private contentParts: ContentPart[] = [];

	constructor(private readonly cleanText: (text: string) => string) {}

	setText(text: string): void {
		this.text = text;
	}

	recordToolCall(call: ToolCall): ContentPart[] {
		const pendingText = this.cleanText(
			this.text.slice(this.textCheckpoint),
		);
		if (pendingText) {
			this.contentParts.push({ type: "text", content: pendingText });
		}
		this.toolCalls.push({ call });
		this.contentParts.push({ type: "tool_call", call });
		this.textCheckpoint = this.text.length;
		return [...this.contentParts];
	}

	recordToolResult(call: ToolCall, result: ToolResult): ContentPart[] {
		const callIndex = this.toolCalls.findIndex(
			(entry) => entry.call.toolCallId === call.toolCallId,
		);
		if (callIndex >= 0) {
			this.toolCalls[callIndex] = {
				...this.toolCalls[callIndex],
				result,
			};
		}

		const partIndex = this.contentParts.findIndex(
			(part) =>
				part.type === "tool_call" &&
				part.call.toolCallId === call.toolCallId,
		);
		if (partIndex >= 0) {
			const part = this.contentParts[partIndex];
			if (part.type === "tool_call") {
				this.contentParts[partIndex] = { ...part, result };
			}
		}
		return [...this.contentParts];
	}

	appendTextPart(content: string): void {
		if (content) {
			this.contentParts.push({ type: "text", content });
		}
	}

	finishToolText(): void {
		this.appendTextPart(this.pendingText());
	}

	pendingText(): string {
		return this.cleanText(this.text.slice(this.textCheckpoint));
	}

	snapshot(): ChatTurnOutputSnapshot {
		return {
			text: this.text,
			toolCalls: [...this.toolCalls],
			contentParts: [...this.contentParts],
		};
	}
}
