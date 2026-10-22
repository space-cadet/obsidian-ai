import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChatRuntimeState } from "../useChatRuntimeState";

describe("useChatRuntimeState session run limits", () => {
	it("settles approvals on disposal without letting an old completion release a new run", () => {
		const owner = {};
		const first = renderHook(() => useChatRuntimeState("a", owner));
		const controller = new AbortController();
		const resolveTool = vi.fn();
		const oldRelease = first.result.current.releaseSessionRun;
		act(() => {
			first.result.current.reserveSessionRun("a", 1);
			first.result.current.patchRuntime("a", {
				controller,
				isStreaming: true,
				resolveTool,
			});
		});
		first.unmount();
		expect(controller.signal.aborted).toBe(true);
		expect(resolveTool).toHaveBeenCalledWith(null);
		const next = renderHook(() => useChatRuntimeState("a", owner));
		expect(next.result.current.reserveSessionRun("a", 1)).toBe("reserved");
		oldRelease("a");
		expect(next.result.current.reserveSessionRun("a", 1)).toBe(
			"already-running",
		);
	});

	it("settles a pending approval before a closed tab runtime is cleared", async () => {
		const owner = {};
		const { result } = renderHook(() => useChatRuntimeState("a", owner));
		const controller = new AbortController();
		let resolveApproval!: (value: unknown) => void;
		const approval = new Promise<unknown>((resolve) => {
			resolveApproval = resolve;
		});
		act(() => {
			expect(result.current.reserveSessionRun("session-a", 1)).toBe(
				"reserved",
			);
			result.current.patchRuntime("session-a", {
				controller,
				isStreaming: true,
				resolveTool: resolveApproval,
			});
		});
		const sendCompletion = approval.then(() => {
			result.current.releaseSessionRun("session-a");
		});

		act(() => {
			result.current.abortRuntime("session-a");
			result.current.clearRuntime("session-a");
		});
		await expect(approval).resolves.toBe(null);
		await sendCompletion;

		expect(controller.signal.aborted).toBe(true);
		act(() => {
			expect(result.current.reserveSessionRun("session-b", 1)).toBe(
				"reserved",
			);
		});
	});

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
			expect(secondView.result.current.isSessionBusy("session-a")).toBe(
				true,
			);
			firstView.result.current.releaseSessionRun("session-a");
			expect(secondView.result.current.isSessionBusy("session-a")).toBe(
				false,
			);
			expect(
				secondView.result.current.reserveSessionRun("session-b", 1),
			).toBe("reserved");
		});
	});
});
