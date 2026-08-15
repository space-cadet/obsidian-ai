import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ChatTabBar from "../ChatTabBar";
import type { ChatSession } from "../../types";

const longTitle = "Other Words and HelloChinese Programming Vocabulary";

function session(id: string, title: string): ChatSession {
	return {
		id,
		title,
		createdAt: 1,
		updatedAt: 1,
		messages: [],
		contextItems: [],
	};
}

describe("ChatTabBar", () => {
	it("puts the complete session title on the tab button, not the tab list", () => {
		render(
			<ChatTabBar
				sessions={[session("one", longTitle)]}
				openSessionIds={["one"]}
				activeSessionId="one"
				onSelect={vi.fn()}
				onClose={vi.fn()}
				onCloseOthers={vi.fn()}
				onCloseToRight={vi.fn()}
				onRename={vi.fn()}
			/>,
		);

		const tab = screen.getByRole("tab", { name: longTitle });
		expect(tab.getAttribute("title")).toBe(longTitle);
		expect(screen.getByRole("tablist").hasAttribute("aria-label")).toBe(
			false,
		);
	});

	it("keeps a close control when there is only one tab", () => {
		const onClose = vi.fn();
		render(
			<ChatTabBar
				sessions={[session("one", "One chat")]}
				openSessionIds={["one"]}
				activeSessionId="one"
				onSelect={vi.fn()}
				onClose={onClose}
				onCloseOthers={vi.fn()}
				onCloseToRight={vi.fn()}
				onRename={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Close One chat" }));
		expect(onClose).toHaveBeenCalledWith("one");
	});
});
