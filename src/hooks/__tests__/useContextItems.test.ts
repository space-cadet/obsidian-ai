import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useContextItems } from "../useContextItems";

vi.mock("obsidian", () => ({
	WorkspaceLeaf: class {},
	MarkdownView: class {},
}));

const selectedNote = {
	id: "note-1",
	type: "note" as const,
	path: "old-chat-note.md",
	name: "Old chat note",
};

function session(id: string, contextItems: any[]) {
	return {
		id,
		title: "",
		createdAt: 0,
		updatedAt: 0,
		messages: [],
		contextItems,
	};
}

describe("useContextItems", () => {
	it("clears the callback-facing context before a new session can send", () => {
		const sessionsRef = {
			current: [session("old", [selectedNote]), session("new", [])],
		};
		const activeSessionIdRef = { current: "old" as string | null };
		const setSessions = vi.fn();
		const setWasTruncated = vi.fn();
		const plugin = {
			app: {
				workspace: {
					getLeavesOfType: vi.fn(() => []),
					on: vi.fn(),
					off: vi.fn(),
				},
			},
		} as any;

		const { result, rerender } = renderHook(
			({ activeSessionId }) =>
				useContextItems(
					plugin,
					sessionsRef,
					activeSessionId,
					activeSessionIdRef,
					setSessions,
					setWasTruncated,
					vi.fn(),
				),
			{ initialProps: { activeSessionId: "old" as string | null } },
		);

		expect(result.current.contextItems).toEqual([selectedNote]);
		expect(result.current.contextItemsRef.current).toEqual([selectedNote]);

		act(() => {
			activeSessionIdRef.current = "new";
			rerender({ activeSessionId: "new" });
		});

		expect(result.current.contextItems).toEqual([]);
		expect(result.current.contextItemsRef.current).toEqual([]);
	});
});
