import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { useSessionActions } from "../useSessionActions";

vi.mock("obsidian", () => ({
	Notice: class {},
	PluginSettingTab: class {},
}));

vi.mock("../../settings", () => ({
	getActiveProviderProfile: (settings: { providerProfiles: unknown[] }) =>
		settings.providerProfiles[0],
}));

describe("useSessionActions", () => {
	it("opens a distinct draft tab for every new-chat action", () => {
		let draftNumber = 0;
		const createNewSession = vi.fn(() => ({
			id: `draft-${++draftNumber}`,
			title: "",
			createdAt: 0,
			updatedAt: 0,
			messages: [],
			contextItems: [],
		}));
		const plugin = {
			settings: {
				includeActiveNote: false,
				selectedProfileIds: [],
				providerProfiles: [{ id: "default", provider: "ollama" }],
				activeProviderProfileId: "default",
			},
		} as any;
		const sessionsRef = { current: [] as any[] };
		const activeSessionIdRef = { current: null as string | null };

		const { result } = renderHook(() => {
			const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
			return useSessionActions({
				plugin,
				sessionsRef,
				activeSessionIdRef,
				setSessions: vi.fn(),
				setActiveSessionId: vi.fn(),
				setScrollToMessageId: vi.fn(),
				createNewSession,
				setSelectedProfileIds: vi.fn(),
				getSelectedProfileIds: () => ["default"],
				setDebateMode: vi.fn(),
				setWasTruncated: vi.fn(),
				isStreaming: false,
				abortActiveRuntime: vi.fn(),
				clearSessionRuntime: vi.fn(),
				openSessionIds,
				setOpenSessionIds,
			});
		});

		act(() => result.current.handleNewChat());
		act(() => result.current.handleNewChat());

		expect(createNewSession).toHaveBeenCalledTimes(2);
		expect(result.current.openSessionIds).toEqual(["draft-1", "draft-2"]);
	});

	it("inherits the active tab model when opening a new tab", () => {
		const createNewSession = vi.fn(() => ({
			id: "draft-1", title: "", createdAt: 0, updatedAt: 0, messages: [], contextItems: [],
		}));
		const plugin = {
			settings: { includeActiveNote: false, selectedProfileIds: ["global"], providerProfiles: [{ id: "global", provider: "ollama" }], activeProviderProfileId: "global" },
		} as any;
		const sessionsRef = { current: [] as any[] };
		const activeSessionIdRef = { current: null as string | null };
		const { result } = renderHook(() => {
			const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
			return useSessionActions({
			plugin,
			sessionsRef,
			activeSessionIdRef,
			setSessions: vi.fn(), setActiveSessionId: vi.fn(), setScrollToMessageId: vi.fn(),
			createNewSession, setSelectedProfileIds: vi.fn(), getSelectedProfileIds: () => ["gemini-tab"],
			setDebateMode: vi.fn(), setWasTruncated: vi.fn(), isStreaming: false,
			abortActiveRuntime: vi.fn(), clearSessionRuntime: vi.fn(),
			openSessionIds, setOpenSessionIds,
			});
		});

		act(() => result.current.handleNewChat());
		expect(createNewSession).toHaveBeenCalledWith(expect.objectContaining({ selectedProfileIds: ["gemini-tab"] }));
	});
});
