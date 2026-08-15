import { describe, expect, it } from "vitest";
import { OPEN_CHAT_COMMAND_ID, OPEN_CHAT_COMMAND_NAME } from "./main";

describe("Chat Lab command identity", () => {
	it("keeps the sidebar command discoverable by its branded name", () => {
		expect(OPEN_CHAT_COMMAND_ID).toBe("open-chat-lab-sidebar");
		expect(OPEN_CHAT_COMMAND_NAME).toBe("Open Chat Lab AI sidebar");
	});
});
