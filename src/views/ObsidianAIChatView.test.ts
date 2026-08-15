import { describe, expect, it } from "vitest";
import { ObsidianAIChatView, CHAT_VIEWTYPE } from "./ObsidianAIChatView";

describe("ObsidianAIChatView identity", () => {
	it("uses the Chat Lab AI sidebar title", () => {
		const view = Object.create(
			ObsidianAIChatView.prototype,
		) as ObsidianAIChatView;

		expect(view.getViewType()).toBe(CHAT_VIEWTYPE);
		expect(view.getDisplayText()).toBe("Chat Lab AI");
		expect(view.getIcon()).toBe("message-square");
	});
});
