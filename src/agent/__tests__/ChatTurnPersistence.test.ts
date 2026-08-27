import { describe, expect, it } from "vitest";
import {
	appendMessageToSession,
	createAssistantMessage,
} from "../ChatTurnPersistence";

describe("chat-turn persistence helpers", () => {
	it("creates an assistant message and appends it to one session", () => {
		const message = createAssistantMessage({
			content: "Done",
			estimatedTokens: 12,
			modelName: "test-model",
		});
		const first = {
			id: "session-1",
			title: "First",
			createdAt: 0,
			updatedAt: 0,
			messages: [],
			contextItems: [],
		};
		const second = { ...first, id: "session-2" };

		const result = appendMessageToSession(
			[first, second],
			"session-1",
			message,
		);

		expect(result[0].messages).toEqual([message]);
		expect(result[1].messages).toEqual([]);
	});
});
