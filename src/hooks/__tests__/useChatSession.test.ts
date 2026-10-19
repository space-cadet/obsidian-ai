import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChatSession } from "../useChatSession";

vi.mock("../../settings", () => ({
	getActiveProviderProfile: () => ({ id: "default", provider: "ollama" }),
}));

function setup(
	hydrate = vi.fn(async (id: string) => [
		{ id: `${id}-message`, role: "user", content: "Hello" },
	]),
) {
	const sessions = ["active", "background"].map((id) => ({
		id,
		title: id,
		createdAt: 0,
		updatedAt: 0,
		messages: [],
		messageCount: 1,
		hydrated: false,
		contextItems: [],
	}));
	const plugin = {
		settings: { restoreChatTabs: true, autoNameSessions: false },
		loadChatData: vi.fn().mockResolvedValue({
			sessions,
			activeSessionId: "active",
			openSessionIds: ["active", "background"],
		}),
		saveChatData: vi.fn().mockResolvedValue(undefined),
		hydrateSession: hydrate,
		peekSessionMessages: vi.fn().mockResolvedValue([]),
	} as any;
	const hook = renderHook(() => useChatSession({ plugin }));
	return { ...hook, plugin };
}

describe("restored session hydration", () => {
	it("shares session updates across views using one plugin instance", async () => {
		const { result, plugin } = setup();
		await waitFor(() => expect(result.current.chatDataLoaded).toBe(true));
		const secondView = renderHook(() => useChatSession({ plugin }));
		await waitFor(() =>
			expect(secondView.result.current.chatDataLoaded).toBe(true),
		);
		act(() => result.current.renameSession("active", "Shared title"));
		expect(
			secondView.result.current.sessions.find((s) => s.id === "active")
				?.title,
		).toBe("Shared title");
		secondView.unmount();
	});

	it("loads only the active transcript at startup and loads another on activation", async () => {
		const { result, plugin } = setup();
		await waitFor(() =>
			expect(result.current.sessions[0]?.hydrated).toBe(true),
		);
		expect(plugin.hydrateSession.mock.calls).toEqual([["active"]]);
		expect(result.current.openSessionIds).toEqual(["active", "background"]);
		expect(result.current.sessions[1]).toMatchObject({
			hydrated: false,
			messageCount: 1,
			messages: [],
		});
		// Close actions select their replacement using this same setter.
		act(() => result.current.setActiveSessionId("background"));
		await waitFor(() =>
			expect(result.current.sessions[1].hydrated).toBe(true),
		);
		expect(plugin.hydrateSession.mock.calls).toEqual([
			["active"],
			["background"],
		]);
		expect(result.current.sessions[1].messages[0].id).toBe(
			"background-message",
		);
	});

	it("keeps failed/empty hydration retryable without clearing its saved count", async () => {
		const hydrate = vi
			.fn()
			.mockRejectedValueOnce(new Error("read failed"))
			.mockResolvedValue([]);
		const { result, plugin } = setup(hydrate);
		await waitFor(() => expect(hydrate).toHaveBeenCalledWith("active"));
		await act(async () => {
			await Promise.resolve();
		});
		expect(result.current.sessions[0]).toMatchObject({
			hydrated: false,
			messageCount: 1,
			messages: [],
		});
		act(() => result.current.setActiveSessionId("background"));
		await waitFor(() =>
			expect(plugin.peekSessionMessages).toHaveBeenCalledWith(
				"background",
			),
		);
		expect(result.current.sessions[1].hydrated).toBe(false);
		act(() => result.current.setActiveSessionId("active"));
		await waitFor(() =>
			expect(
				hydrate.mock.calls.filter(([id]) => id === "active"),
			).toHaveLength(2),
		);
	});

	it("retains shared hydration after switching away mid-load", async () => {
		let resolveActive!: (messages: any[]) => void;
		const hydrate = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveActive = resolve;
					}),
			)
			.mockResolvedValue([]);
		const { result, plugin } = setup(hydrate);
		await waitFor(() => expect(hydrate).toHaveBeenCalledWith("active"));
		act(() => result.current.setActiveSessionId("background"));
		await act(async () => {
			resolveActive([{ id: "old", role: "user", content: "Hello" }]);
		});
		expect(result.current.sessions[0].hydrated).toBe(true);
		expect(result.current.sessions[0].messages[0].id).toBe("old");
		act(() => result.current.setActiveSessionId("active"));
		await waitFor(() =>
			expect(result.current.sessions[0].hydrated).toBe(true),
		);
		expect(result.current.sessions[0].messages[0].id).toBe("old");
	});
});

describe("session deletion tombstones", () => {
	it("retains them after a failed save and clears them after success", async () => {
		const { result, plugin } = setup();
		plugin.saveChatData
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValue(undefined);

		await waitFor(() => expect(result.current.chatDataLoaded).toBe(true));
		act(() => result.current.deleteSession("background"));
		await waitFor(() =>
			expect(plugin.saveChatData).toHaveBeenCalledTimes(1),
		);
		expect(plugin.saveChatData.mock.calls[0][0].deletedSessionIds).toEqual([
			"background",
		]);

		act(() => result.current.setOpenSessionIds(["active"]));
		await waitFor(() =>
			expect(plugin.saveChatData).toHaveBeenCalledTimes(2),
		);
		expect(plugin.saveChatData.mock.calls[1][0].deletedSessionIds).toEqual([
			"background",
		]);
		await act(async () => {
			await Promise.resolve();
		});

		act(() => result.current.setOpenSessionIds([]));
		await waitFor(() =>
			expect(plugin.saveChatData).toHaveBeenCalledTimes(3),
		);
		expect(plugin.saveChatData.mock.calls[2][0].deletedSessionIds).toEqual(
			[],
		);
	});
});
