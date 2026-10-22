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
	it.each([false, true])(
		"allows UI deletion only when the shared busy check is false (busy=%s)",
		(busy) => {
			const markSessionDeleted = vi.fn();
			const plugin = {
				settings: { includeActiveNote: false },
			} as any;
			const sessionsRef = { current: [] as any[] };
			const activeSessionIdRef = { current: null as string | null };
			const { result } = renderHook(() => {
				const [openSessionIds, setOpenSessionIds] = useState<string[]>(
					[],
				);
				return useSessionActions({
					plugin,
					sessionsRef,
					activeSessionIdRef,
					updateSessionMetadata: vi.fn(),
					updateSessionMessages: vi.fn(),
					setActiveSessionId: vi.fn(),
					setScrollToMessageId: vi.fn(),
					createNewSession: vi.fn(),
					setSelectedProfileIds: vi.fn(),
					getSelectedProfileIds: () => [],
					setDebateMode: vi.fn(),
					setWasTruncated: vi.fn(),
					clearSessionRuntime: vi.fn(),
					markSessionDeleted,
					isSessionBusy: () => busy,
					openSessionIds,
					setOpenSessionIds,
				});
			});

			act(() => result.current.handleDeleteSession("deleted-id"));

			if (busy) expect(markSessionDeleted).not.toHaveBeenCalled();
			else expect(markSessionDeleted).toHaveBeenCalledWith("deleted-id");
		},
	);

	it("opens a distinct draft tab for every new-chat action", () => {
		let draftNumber = 0;
		const createNewSession = vi.fn(() => {
			const draft = {
				id: `draft-${++draftNumber}`,
				title: "",
				createdAt: 0,
				updatedAt: 0,
				messages: [],
				contextItems: [],
			};
			sessionsRef.current = [...sessionsRef.current, draft];
			return draft;
		});
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
		const abortActiveRuntime = vi.fn();

		const { result } = renderHook(() => {
			const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
			return useSessionActions({
				plugin,
				sessionsRef,
				activeSessionIdRef,
				updateSessionMetadata: vi.fn(),
				updateSessionMessages: vi.fn(),
				setActiveSessionId: vi.fn(),
				setScrollToMessageId: vi.fn(),
				createNewSession,
				setSelectedProfileIds: vi.fn(),
				getSelectedProfileIds: () => ["default"],
				setDebateMode: vi.fn(),
				setWasTruncated: vi.fn(),
				isStreaming: true,
				abortActiveRuntime,
				clearSessionRuntime: vi.fn(),
				markSessionDeleted: vi.fn(),
				openSessionIds,
				setOpenSessionIds,
			} as any);
		});

		act(() => result.current.handleNewChat());
		act(() => result.current.handleNewChat());

		expect(createNewSession).toHaveBeenCalledTimes(2);
		expect(result.current.openSessionIds).toEqual(["draft-1", "draft-2"]);
		expect(abortActiveRuntime).not.toHaveBeenCalled();
	});

	it.each(["messages", "index-only", "unsent draft"])(
		"keeps an active tabless session with %s open when creating a new tab",
		(contentKind) => {
			const sentSession = {
				id: "tabless-session",
				title: "Sent chat",
				createdAt: 0,
				updatedAt: 1,
				messages: [{ id: "message-1", role: "user", content: "Hello" }],
				contextItems: [],
			};
			const sessionsRef = { current: [sentSession] as any[] };
			if (contentKind === "index-only") {
				Object.assign(sentSession, {
					messages: [],
					hydrated: false,
					messageCount: 1,
				});
			} else if (contentKind === "unsent draft") {
				Object.assign(sentSession, {
					messages: [],
					draft: "An unfinished question",
				});
			}
			const activeSessionIdRef = {
				current: sentSession.id as string | null,
			};
			const createNewSession = vi.fn(() => {
				const freshSession = {
					id: "fresh-session",
					title: "",
					createdAt: 2,
					updatedAt: 2,
					messages: [],
					contextItems: [],
				};
				sessionsRef.current = [...sessionsRef.current, freshSession];
				activeSessionIdRef.current = freshSession.id;
				return freshSession;
			});
			const plugin = {
				settings: {
					includeActiveNote: false,
					selectedProfileIds: [],
					providerProfiles: [{ id: "default", provider: "ollama" }],
					activeProviderProfileId: "default",
				},
			} as any;

			const { result } = renderHook(() => {
				const [openSessionIds, setOpenSessionIds] = useState<string[]>(
					[],
				);
				return useSessionActions({
					plugin,
					sessionsRef,
					activeSessionIdRef,
					updateSessionMetadata: vi.fn(),
					updateSessionMessages: vi.fn(),
					setActiveSessionId: (value) => {
						activeSessionIdRef.current =
							typeof value === "function"
								? value(activeSessionIdRef.current)
								: value;
					},
					setScrollToMessageId: vi.fn(),
					createNewSession,
					setSelectedProfileIds: vi.fn(),
					getSelectedProfileIds: () => ["default"],
					setDebateMode: vi.fn(),
					setWasTruncated: vi.fn(),
					clearSessionRuntime: vi.fn(),
					markSessionDeleted: vi.fn(),
					openSessionIds,
					setOpenSessionIds,
				});
			});

			act(() => result.current.handleNewChat());

			expect(result.current.openSessionIds).toEqual([
				"tabless-session",
				"fresh-session",
			]);
		},
	);

	it.each(["new", "restore", "direct", "event"])(
		"opens only the requested tab after closing the last tab via %s",
		(entryPoint) => {
			const savedSession = {
				id: "saved-session",
				title: "Saved chat",
				createdAt: 0,
				updatedAt: 1,
				messages: [{ id: "message-1", role: "user", content: "Hello" }],
				contextItems: [],
			};
			const sessionsRef = { current: [savedSession] as any[] };
			const activeSessionIdRef = {
				current: savedSession.id as string | null,
			};
			const plugin = {
				settings: {
					includeActiveNote: false,
					selectedProfileIds: [],
					providerProfiles: [{ id: "default", provider: "ollama" }],
					activeProviderProfileId: "default",
					autoNameSessions: true,
				},
				onSessionEnd: vi.fn(),
			} as any;
			let draftNumber = 0;
			const createNewSession = vi.fn(() => {
				const draft = {
					id: `draft-${++draftNumber}`,
					title: "",
					createdAt: 2,
					updatedAt: 2,
					messages: [],
					contextItems: [],
				};
				sessionsRef.current = [...sessionsRef.current, draft];
				activeSessionIdRef.current = draft.id;
				return draft;
			});

			const { result } = renderHook(() => {
				const [openSessionIds, setOpenSessionIds] = useState([
					savedSession.id,
				]);
				return useSessionActions({
					plugin,
					sessionsRef,
					activeSessionIdRef,
					updateSessionMetadata: vi.fn(),
					updateSessionMessages: vi.fn(),
					setActiveSessionId: (value) => {
						activeSessionIdRef.current =
							typeof value === "function"
								? value(activeSessionIdRef.current)
								: value;
					},
					setScrollToMessageId: vi.fn(),
					createNewSession,
					setSelectedProfileIds: vi.fn(),
					getSelectedProfileIds: () => ["default"],
					setDebateMode: vi.fn(),
					setWasTruncated: vi.fn(),
					clearSessionRuntime: vi.fn(),
					markSessionDeleted: vi.fn(),
					openSessionIds,
					setOpenSessionIds,
				});
			});

			act(() => result.current.handleCloseTab(savedSession.id));
			expect(result.current.openSessionIds).toEqual([]);
			expect(createNewSession).toHaveBeenCalledTimes(1);

			act(() => {
				if (entryPoint === "new") result.current.handleNewChat();
				else if (entryPoint === "restore")
					result.current.handleLoadSession(savedSession.id);
				else if (entryPoint === "direct")
					result.current.openSessionInTab(
						savedSession.id,
						"message-1",
					);
				else
					window.dispatchEvent(
						new CustomEvent("obsidian-ai:open-session", {
							detail: {
								sessionId: savedSession.id,
								messageId: "message-1",
							},
						}),
					);
			});

			expect(result.current.openSessionIds).toEqual([
				entryPoint === "new" ? "draft-1" : savedSession.id,
			]);
			expect(createNewSession).toHaveBeenCalledTimes(1);
			expect(plugin.onSessionEnd).not.toHaveBeenCalled();
		},
	);

	it.each(["messages", "index-only", "unsent draft"])(
		"keeps an active tabless session with %s open when restoring an older session",
		(contentKind) => {
			const sessionsRef = {
				current: [
					{
						id: "tabless-session",
						title: "Sent chat",
						createdAt: 0,
						updatedAt: 2,
						messages: [
							{ id: "message-1", role: "user", content: "Hello" },
						],
						contextItems: [],
					},
					{
						id: "older-session",
						title: "Older chat",
						createdAt: 0,
						updatedAt: 1,
						messages: [
							{
								id: "message-2",
								role: "user",
								content: "Earlier",
							},
						],
						contextItems: [],
					},
				] as any[],
			};
			const activeSessionIdRef = {
				current: "tabless-session" as string | null,
			};
			if (contentKind === "index-only") {
				Object.assign(sessionsRef.current[0], {
					messages: [],
					hydrated: false,
					messageCount: 1,
				});
			} else if (contentKind === "unsent draft") {
				Object.assign(sessionsRef.current[0], {
					messages: [],
					draft: "An unfinished question",
				});
			}
			const plugin = {
				settings: {
					includeActiveNote: false,
					selectedProfileIds: [],
					providerProfiles: [{ id: "default", provider: "ollama" }],
					activeProviderProfileId: "default",
				},
			} as any;

			const { result } = renderHook(() => {
				const [openSessionIds, setOpenSessionIds] = useState<string[]>(
					[],
				);
				return useSessionActions({
					plugin,
					sessionsRef,
					activeSessionIdRef,
					updateSessionMetadata: vi.fn(),
					updateSessionMessages: vi.fn(),
					setActiveSessionId: (value) => {
						activeSessionIdRef.current =
							typeof value === "function"
								? value(activeSessionIdRef.current)
								: value;
					},
					setScrollToMessageId: vi.fn(),
					createNewSession: vi.fn(),
					setSelectedProfileIds: vi.fn(),
					getSelectedProfileIds: () => [],
					setDebateMode: vi.fn(),
					setWasTruncated: vi.fn(),
					clearSessionRuntime: vi.fn(),
					markSessionDeleted: vi.fn(),
					openSessionIds,
					setOpenSessionIds,
				});
			});

			act(() => result.current.handleLoadSession("older-session"));

			expect(result.current.openSessionIds).toEqual([
				"tabless-session",
				"older-session",
			]);
			expect(activeSessionIdRef.current).toBe("older-session");
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
				updateSessionMetadata: vi.fn(),
				updateSessionMessages: vi.fn(),
				setActiveSessionId: vi.fn(),
				setScrollToMessageId: vi.fn(),
				createNewSession,
				setSelectedProfileIds: vi.fn(),
				getSelectedProfileIds: () => ["gemini-tab"],
				setDebateMode: vi.fn(),
				setWasTruncated: vi.fn(),
				clearSessionRuntime: vi.fn(),
				markSessionDeleted: vi.fn(),
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
		const updateSessionMessages = vi.fn();
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
				updateSessionMetadata: vi.fn(),
				updateSessionMessages,
				setActiveSessionId: vi.fn(),
				setScrollToMessageId: vi.fn(),
				createNewSession: vi.fn(),
				setSelectedProfileIds: vi.fn(),
				getSelectedProfileIds: () => ["default"],
				setDebateMode: vi.fn(),
				setWasTruncated: vi.fn(),
				clearSessionRuntime: vi.fn(),
				markSessionDeleted: vi.fn(),
				openSessionIds,
				setOpenSessionIds,
			});
		});

		await act(async () => {
			result.current.openSessionInTab(session.id);
			await Promise.resolve();
		});

		expect(plugin.peekSessionMessages).toHaveBeenCalledWith(session.id);
		expect(updateSessionMessages).toHaveBeenCalledWith(
			session.id,
			messages,
		);
	});
});
