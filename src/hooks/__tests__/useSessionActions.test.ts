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

	it.each([{ tabs: [] as string[] }, { tabs: ["running-session"] }])(
		"keeps an in-flight session open when creating a new tab (existing tabs: %j)",
		({ tabs: initialTabs }) => {
			const runningSession = {
				id: "running-session",
				title: "",
				createdAt: 0,
				updatedAt: 0,
				messages: [{ id: "user-message", role: "user", content: "Hi" }],
				contextItems: [],
			};
			const createNewSession = vi.fn(() => ({
				id: "new-session",
				title: "",
				createdAt: 1,
				updatedAt: 1,
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
			const sessionsRef = { current: [runningSession] as any[] };
			const activeSessionIdRef = {
				current: runningSession.id as string | null,
			};

			const clearSessionRuntime = vi.fn();
			const { result } = renderHook(() => {
				const [openSessionIds, setOpenSessionIds] =
					useState<string[]>(initialTabs);
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
					isStreaming: true,
					clearSessionRuntime,
					openSessionIds,
					setOpenSessionIds,
				});
			});

			act(() => result.current.handleNewChat());
			expect(clearSessionRuntime).not.toHaveBeenCalled();

			expect(result.current.openSessionIds).toEqual([
				runningSession.id,
				"new-session",
			]);
		},
	);

	it("inherits the active tab model when opening a new tab", () => {
		const createNewSession = vi.fn(() => ({
			id: "draft-1",
			title: "",
			createdAt: 0,
			updatedAt: 0,
			messages: [],
			contextItems: [],
		}));
		const plugin = {
			settings: {
				includeActiveNote: false,
				selectedProfileIds: ["global"],
				providerProfiles: [{ id: "global", provider: "ollama" }],
				activeProviderProfileId: "global",
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
				getSelectedProfileIds: () => ["gemini-tab"],
				setDebateMode: vi.fn(),
				setWasTruncated: vi.fn(),
				isStreaming: false,
				clearSessionRuntime: vi.fn(),
				openSessionIds,
				setOpenSessionIds,
			});
		});

		act(() => result.current.handleNewChat());
		expect(createNewSession).toHaveBeenCalledWith(
			expect.objectContaining({ selectedProfileIds: ["gemini-tab"] }),
		);
	});

	it("opens a synced session when hydration state is already known to storage", async () => {
		const session = {
			id: "downloaded-session",
			title: "Downloaded chat",
			createdAt: 0,
			updatedAt: 0,
			messages: [],
			messageCount: 1,
			hydrated: false,
			contextItems: [],
		};
		const messages = [{ id: "message-1", role: "user", content: "Hello" }];
		const setSessions = vi.fn();
		const plugin = {
			settings: {
				includeActiveNote: false,
				selectedProfileIds: [],
				providerProfiles: [{ id: "default", provider: "ollama" }],
				activeProviderProfileId: "default",
			},
			hydrateSession: vi.fn().mockResolvedValue([]),
			peekSessionMessages: vi.fn().mockResolvedValue(messages),
		} as any;
		const sessionsRef = { current: [session] as any[] };
		const activeSessionIdRef = { current: null as string | null };

		const { result } = renderHook(() => {
			const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
			return useSessionActions({
				plugin,
				sessionsRef,
				activeSessionIdRef,
				setSessions,
				setActiveSessionId: vi.fn(),
				setScrollToMessageId: vi.fn(),
				createNewSession: vi.fn(),
				setSelectedProfileIds: vi.fn(),
				getSelectedProfileIds: () => ["default"],
				setDebateMode: vi.fn(),
				setWasTruncated: vi.fn(),
				isStreaming: false,
				clearSessionRuntime: vi.fn(),
				openSessionIds,
				setOpenSessionIds,
			});
		});

		await act(async () => {
			result.current.openSessionInTab(session.id);
			await Promise.resolve();
		});

		expect(plugin.peekSessionMessages).toHaveBeenCalledWith(session.id);
		const savedSessions = setSessions.mock.calls.at(-1)?.[0];
		expect(savedSessions[0]).toMatchObject({
			id: session.id,
			messages,
			hydrated: true,
			messageCount: 1,
		});
	});
});
