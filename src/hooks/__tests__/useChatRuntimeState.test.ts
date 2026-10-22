import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useChatRuntimeState } from "../useChatRuntimeState";

describe("useChatRuntimeState session run limits", () => {
	it("reserves up to the configured limit and frees capacity after release", () => {
		const owner = {};
		const { result } = renderHook(() => useChatRuntimeState(null, owner));

		act(() => {
			expect(result.current.reserveSessionRun("session-a", 2)).toBe(
				"reserved",
			);
			expect(result.current.reserveSessionRun("session-b", 2)).toBe(
				"reserved",
			);
			expect(result.current.reserveSessionRun("session-c", 2)).toBe(
				"limit-reached",
			);
			result.current.releaseSessionRun("session-a");
			expect(result.current.reserveSessionRun("session-c", 2)).toBe(
				"reserved",
			);
		});
	});

	it("counts active runtimes and prevents a duplicate run in the same session", () => {
		const owner = {};
		const { result } = renderHook(() => useChatRuntimeState(null, owner));

		act(() => {
			result.current.patchRuntime("session-a", {
				isStreaming: true,
				controller: new AbortController(),
			});
			expect(result.current.reserveSessionRun("session-a", 2)).toBe(
				"already-running",
			);
			expect(result.current.reserveSessionRun("session-b", 1)).toBe(
				"limit-reached",
			);
		});
	});

	it("shares reservations between chat views for the same plugin", () => {
		const owner = {};
		const firstView = renderHook(() => useChatRuntimeState(null, owner));
		const secondView = renderHook(() => useChatRuntimeState(null, owner));

		act(() => {
			expect(
				firstView.result.current.reserveSessionRun("session-a", 1),
			).toBe("reserved");
			expect(
				secondView.result.current.reserveSessionRun("session-b", 1),
			).toBe("limit-reached");
			firstView.result.current.releaseSessionRun("session-a");
			expect(
				secondView.result.current.reserveSessionRun("session-b", 1),
			).toBe("reserved");
		});
	});
});
