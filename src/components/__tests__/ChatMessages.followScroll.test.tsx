import { render, screen, act } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ChatMessages from "../ChatMessages";
import type { ChatMessage } from "../../types";

/** Regression test: sending a message while a saved scroll position exists
	must follow the new message to the bottom — the restore effect may not
	re-run on message growth and drag the view back to the stale saved spot. */

const makeMsg = (id: string, role: "user" | "assistant"): ChatMessage => ({
	id,
	role,
	content: `message ${id}`,
	timestamp: 1,
});

const baseProps = {
	sessionId: "s1",
	currentAiMessage: "",
	isStreaming: false,
	isEditing: false,
	app: {} as any,
	renderMarkdown: async () => {},
	onAppend: () => {},
	onInsertAtCursor: () => {},
	onApply: () => {},
	onRetry: () => {},
	onEdit: () => {},
	onApplyToTarget: () => {},
	onCreateNote: () => {},
	onAppendToTarget: () => {},
};

let rafQueue: FrameRequestCallback[] = [];

function flushRaf() {
	const pending = rafQueue;
	rafQueue = [];
	act(() => {
		pending.forEach((cb) => cb(0));
	});
}

describe("ChatMessages follow-scroll vs restore race", () => {
	beforeEach(() => {
		rafQueue = [];
		vi.spyOn(window, "requestAnimationFrame").mockImplementation(
			(cb: FrameRequestCallback) => {
				rafQueue.push(cb);
				return rafQueue.length;
			},
		);
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("send wins over a stale saved scroll position; follow stays engaged", () => {
		const first = makeMsg("m1", "user");
		const { rerender } = render(
			<ChatMessages
				{...baseProps}
				messages={[first]}
				restoreScrollTop={500}
			/>,
		);

		const container = document.querySelector<HTMLElement>(
			".chat-messages",
		)!;
		Object.defineProperty(container, "scrollHeight", {
			value: 2000,
			configurable: true,
		});

		// Initial mount: saved position applies after first paint.
		flushRaf();
		expect(container.scrollTop).toBe(500);

		// User sends a new message.
		const sent = makeMsg("m2", "user");
		rerender(
			<ChatMessages
				{...baseProps}
				messages={[first, sent]}
				restoreScrollTop={500}
			/>,
		);
		flushRaf();

		// Follow must land at the bottom, not back at the saved 500px.
		expect(container.scrollTop).toBe(2000);
		// Follow still engaged → no "scroll to bottom" button.
		expect(screen.queryByTitle("Scroll to bottom")).toBeNull();
	});
});
