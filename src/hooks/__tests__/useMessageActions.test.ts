import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMessageActions, UseMessageActionsDeps } from "../useMessageActions";
import { emptyChatRuntime, ChatRuntimeState } from "../useChatRuntimeState";

// ── Mocks ─────────────────────────────────────────────────────────
const mockToolExecutorConstructor = vi.hoisted(() => vi.fn());
const mockToolExecutorInstances = vi.hoisted(() => [] as any[]);
const mockRunChatTurn = vi.hoisted(() => vi.fn());
const mockParseSlashCommand = vi.hoisted(() =>
	vi.fn<
		(text: string) => import("../../lib/slashCommand").SlashCommand | null
	>(() => null),
);
const mockNotice = vi.fn();
const mockCreate = vi.fn();
const mockGetAbstractFileByPath = vi.fn();
const mockMetadataCacheGetFirstLinkpathDest = vi.fn();
const mockVault = {
	create: mockCreate,
	getAbstractFileByPath: mockGetAbstractFileByPath,
};
const mockApp = {
	vault: mockVault,
	metadataCache: {
		getFirstLinkpathDest: mockMetadataCacheGetFirstLinkpathDest,
	},
};
const mockPlugin = {
	app: mockApp,
	settings: {
		providerProfiles: [],
		maxContextTokens: 8000,
		maxContextMessages: 10,
		autoApply: false,
		maxAgentSteps: 5,
		enableAgentTools: false,
	},
	chatapi: {},
	saveSettings: vi.fn(),
};

vi.mock("obsidian", () => ({
	Notice: class {
		constructor(msg: string) {
			mockNotice(msg);
		}
	},
	TFile: class {},
	MarkdownView: class {},
	WorkspaceLeaf: class {},
	Platform: { isMobile: false, isDesktop: true },
}));

vi.mock("../noteEditing/NoteEditingBridge", () => ({
	NoteEditingBridge: {
		appendToNote: vi.fn(),
		insertAtCursor: vi.fn(),
		applyToNote: vi.fn(),
		applyToTargetNote: vi.fn(),
		createNote: vi.fn(),
	},
}));

vi.mock("../context/ContextEngine", () => ({
	resolveContextItems: vi.fn().mockResolvedValue({
		contextString: "",
		wasTruncated: false,
		stats: { estimatedTokens: 0 },
	}),
}));

vi.mock("../context/AttachmentEngine", () => ({
	resolveAttachments: vi.fn().mockResolvedValue([]),
}));

vi.mock("../context/tokenEstimator", () => ({
	estimateTokens: vi.fn(() => 42),
}));

vi.mock("../lib/systemPrompt", () => ({
	buildSystemPrompt: vi.fn(() => "system"),
}));

vi.mock("../lib/slashCommand", () => ({
	parseSlashCommand: mockParseSlashCommand,
}));

vi.mock("../lib/sessionUtils", () => ({
	makeId: vi.fn(() => "mock-id"),
}));

vi.mock("../../agent/ToolExecutor", () => ({
	ToolExecutor: vi.fn().mockImplementation(function (...args) {
		mockToolExecutorConstructor(...args);
		const instance = {
			execute: vi.fn().mockResolvedValue({ success: true }),
			getResolvedToolRegistry: vi.fn(() => ({
				definitions: [],
				tools: {},
				byId: new Map(),
			})),
		};
		mockToolExecutorInstances.push(instance);
		return instance;
	}),
}));

vi.mock("../../agent/ChatTurnCoordinator", () => ({
	runChatTurn: mockRunChatTurn,
}));

vi.mock("../agent/AgentLoop", () => ({
	AgentLoop: vi.fn().mockImplementation(() => ({
		run: vi.fn().mockResolvedValue({ text: "done", tokenEstimate: 10 }),
	})),
}));

vi.mock("../api/AgentApiManager", () => ({
	AgentApiManager: vi.fn(),
}));

vi.mock("../agent/OpenResponsesLoop", () => ({
	OpenResponsesLoop: vi.fn().mockImplementation(() => ({
		run: vi.fn().mockResolvedValue("agent result"),
	})),
}));

vi.mock("../agent/tools/toOpenResponses", () => ({
	noteToolsToOpenResponses: vi.fn(() => []),
	resolvedToolsToOpenResponses: vi.fn(() => []),
}));

vi.mock("../components/MessageBubble", () => ({
	stripThinkingTags: vi.fn((t: string) => t),
}));

// ── Helper to build minimal deps ──────────────────────────────────
function makeDeps(
	overrides: Partial<UseMessageActionsDeps> = {},
): UseMessageActionsDeps {
	const sessionsRef = { current: [] as any[] };
	const activeSessionIdRef = { current: "session-1" };
	const messagesRef = { current: [] as any[] };
	const contextItemsRef = { current: [] as any[] };
	const lastMarkdownLeafRef = { current: null };
	const setSessions = vi.fn();
	const setWasTruncated = vi.fn();
	const setContextTokenCount = vi.fn();
	const setContextItems = vi.fn();
	const runtimeStore: Record<string, ChatRuntimeState> = {};
	const getRuntime = vi.fn((sessionId: string | null | undefined) => {
		if (!sessionId) return emptyChatRuntime;
		return runtimeStore[sessionId] ?? emptyChatRuntime;
	});
	const patchRuntime = vi.fn((sessionId, patch) => {
		if (!sessionId) return;
		const previous = runtimeStore[sessionId] ?? emptyChatRuntime;
		const nextPatch = typeof patch === "function" ? patch(previous) : patch;
		runtimeStore[sessionId] = { ...previous, ...nextPatch };
	});
	const clearRuntime = vi.fn((sessionId) => {
		if (!sessionId) return;
		delete runtimeStore[sessionId];
	});
	const ui = {
		selectedProfileIds: new Set<string>(),
		setSelectedProfileIds: vi.fn(),
		isDropdownOpen: false,
		setIsDropdownOpen: vi.fn(),
		dropdownRef: { current: null },
		showSessionPicker: false,
		setShowSessionPicker: vi.fn(),
		showExportModal: false,
		setShowExportModal: vi.fn(),
		showContextPicker: false,
		setShowContextPicker: vi.fn(),
		isZenMode: false,
		setIsZenMode: vi.fn(),
		debateMode: false,
		setDebateMode: vi.fn(),
		isEditing: false,
		setIsEditing: vi.fn(),
		originalMessages: [],
		setOriginalMessages: vi.fn(),
		editMessageText: "",
		setEditMessageText: vi.fn(),
		messageAttachments: [],
		setMessageAttachments: vi.fn(),
		typingAgents: new Set<string>(),
		setTypingAgents: vi.fn(),
		resetUIState: vi.fn(),
	};
	return {
		plugin: mockPlugin as any,
		orchestrator: null,
		participantRouter: null,
		resolvedProfile: {
			id: "p1",
			name: "Test",
			provider: "openai",
			model: "gpt-4",
			apiKey: "",
			baseUrl: "",
		} as any,
		isGroupChat: false,
		participants: [],
		thinkingEnabled: false,
		sessionsRef,
		activeSessionIdRef,
		setSessions,
		getRuntime,
		patchRuntime,
		clearRuntime,
		setWasTruncated,
		setContextTokenCount,
		setContextItems,
		messagesRef,
		contextItemsRef,
		lastMarkdownLeafRef,
		ui: ui as any,
		...overrides,
	};
}

// ── Tests ─────────────────────────────────────────────────────────
describe("useMessageActions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRunChatTurn.mockReset();
		mockParseSlashCommand.mockReset().mockReturnValue(null);
		mockToolExecutorInstances.length = 0;
	});

	describe("handleStop", () => {
		it("aborts the current controller", () => {
			const abortFn = vi.fn();
			const deps = makeDeps({
				getRuntime: vi.fn(() => ({
					...emptyChatRuntime,
					controller: { abort: abortFn } as any,
				})),
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleStop();
			});
			expect(abortFn).toHaveBeenCalled();
		});

		it("does nothing if controller is null", () => {
			const deps = makeDeps({
				getRuntime: vi.fn(() => emptyChatRuntime),
			});
			const { result } = renderHook(() => useMessageActions(deps));
			expect(() => act(() => result.current.handleStop())).not.toThrow();
		});
	});

	describe("handleEditMessage", () => {
		it("sets editing state and truncates messages at the user message", () => {
			const setSessions = vi.fn();
			const ui = makeDeps().ui;
			const session = {
				id: "session-1",
				messages: [
					{ id: "m1", role: "user", content: "hello" },
					{ id: "m2", role: "assistant", content: "hi" },
					{ id: "m3", role: "user", content: "retry me" },
					{ id: "m4", role: "assistant", content: "ok" },
				],
			} as any;
			const deps = makeDeps({
				sessionsRef: { current: [session] },
				activeSessionIdRef: { current: "session-1" },
				setSessions,
				ui,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleEditMessage("m3");
			});
			expect(ui.setOriginalMessages).toHaveBeenCalledWith(
				session.messages,
			);
			expect(ui.setIsEditing).toHaveBeenCalledWith(true);
			expect(ui.setEditMessageText).toHaveBeenCalledWith("retry me");
			expect(setSessions).toHaveBeenCalled();
		});

		it("does nothing if message is not a user message", () => {
			const setSessions = vi.fn();
			const ui = makeDeps().ui;
			const session = {
				id: "session-1",
				messages: [
					{ id: "m1", role: "user", content: "hello", timestamp: 1 },
					{
						id: "m2",
						role: "assistant",
						content: "hi",
						timestamp: 2,
					},
				],
				title: "Test",
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
			} as any;
			const deps = makeDeps({
				sessionsRef: { current: [session] },
				activeSessionIdRef: { current: "session-1" },
				setSessions,
				ui,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleEditMessage("m2");
			});
			expect(setSessions).not.toHaveBeenCalled();
			expect(ui.setIsEditing).not.toHaveBeenCalled();
		});

		it("does nothing if controller is active", () => {
			const setSessions = vi.fn();
			const ui = makeDeps().ui;
			const deps = makeDeps({
				getRuntime: vi.fn(() => ({
					...emptyChatRuntime,
					controller: {} as any,
				})),
				setSessions,
				ui,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleEditMessage("m1");
			});
			expect(setSessions).not.toHaveBeenCalled();
		});
	});

	describe("handleCancelEdit", () => {
		it("restores original messages and clears editing state", () => {
			const setSessions = vi.fn();
			const ui = makeDeps().ui;
			ui.originalMessages = [
				{ id: "m1", role: "user", content: "hello", timestamp: 1 },
				{ id: "m2", role: "assistant", content: "hi", timestamp: 2 },
			];
			const deps = makeDeps({
				activeSessionIdRef: { current: "session-1" },
				setSessions,
				ui,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleCancelEdit();
			});
			expect(setSessions).toHaveBeenCalled();
			expect(ui.setIsEditing).toHaveBeenCalledWith(false);
			expect(ui.setOriginalMessages).toHaveBeenCalledWith([]);
			expect(ui.setEditMessageText).toHaveBeenCalledWith("");
		});

		it("does nothing if no original messages", () => {
			const setSessions = vi.fn();
			const ui = makeDeps().ui;
			ui.originalMessages = [];
			const deps = makeDeps({
				activeSessionIdRef: { current: "session-1" },
				setSessions,
				ui,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleCancelEdit();
			});
			expect(setSessions).not.toHaveBeenCalled();
		});
	});

	describe("handleRetry", () => {
		it("truncates to before the assistant message and re-sends user content", async () => {
			const setSessions = vi.fn();
			const session = {
				id: "session-1",
				messages: [
					{ id: "m1", role: "user", content: "hello", timestamp: 1 },
					{
						id: "m2",
						role: "assistant",
						content: "hi",
						timestamp: 2,
					},
					{ id: "m3", role: "user", content: "world", timestamp: 3 },
					{
						id: "m4",
						role: "assistant",
						content: "earth",
						timestamp: 4,
					},
				],
				title: "Test",
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
			} as any;
			const deps = makeDeps({
				sessionsRef: { current: [session] },
				activeSessionIdRef: { current: "session-1" },
				setSessions,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleRetry("m4");
			});
			expect(setSessions).toHaveBeenCalled();
		});

		it("does nothing if no preceding user message found", async () => {
			const setSessions = vi.fn();
			const session = {
				id: "session-1",
				messages: [
					{
						id: "m1",
						role: "assistant",
						content: "hi",
						timestamp: 1,
					},
				],
				title: "Test",
				createdAt: 1,
				updatedAt: 1,
				contextItems: [],
			} as any;
			const deps = makeDeps({
				sessionsRef: { current: [session] },
				activeSessionIdRef: { current: "session-1" },
				setSessions,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleRetry("m1");
			});
			expect(setSessions).not.toHaveBeenCalled();
		});

		it("does nothing if controller is active", async () => {
			const setSessions = vi.fn();
			const deps = makeDeps({
				getRuntime: vi.fn(() => ({
					...emptyChatRuntime,
					controller: {} as any,
				})),
				setSessions,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleRetry("m1");
			});
			expect(setSessions).not.toHaveBeenCalled();
		});
	});

	describe("handleApproveTool", () => {
		it("executes pending tool and resolves", async () => {
			const resolve = vi.fn();
			const deps = makeDeps({
				getRuntime: vi.fn(() => ({
					...emptyChatRuntime,
					pendingToolCall: {
						toolCallId: "tc1",
						toolName: "read_note",
						args: { path: "test.md" },
					},
					resolveTool: resolve,
				})),
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleApproveTool();
			});
			expect(resolve).toHaveBeenCalled();
			const currentSessionResult = mockToolExecutorConstructor.mock.calls
				.flat()
				.filter((arg) => typeof arg === "function")
				.map((arg) => (arg as () => string | null)());
			expect(currentSessionResult).toContain("session-1");
		});

		it("does nothing if no pending tool call", async () => {
			const resolve = vi.fn();
			const deps = makeDeps({
				getRuntime: vi.fn(() => ({
					...emptyChatRuntime,
					resolveTool: resolve,
				})),
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleApproveTool();
			});
			expect(resolve).not.toHaveBeenCalled();
		});
	});

	describe("handleRejectTool", () => {
		it("resolves with null", () => {
			const resolve = vi.fn();
			const deps = makeDeps({
				getRuntime: vi.fn(() => ({
					...emptyChatRuntime,
					resolveTool: resolve,
				})),
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleRejectTool();
			});
			expect(resolve).toHaveBeenCalledWith(null);
		});
	});

	describe("handleAppend", () => {
		it("shows notice if no active markdown leaf", async () => {
			const deps = makeDeps({
				lastMarkdownLeafRef: { current: null },
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleAppend("content");
			});
			expect(mockNotice).toHaveBeenCalledWith(
				"⚠️ No active note to append to.",
			);
		});
	});

	describe("handleInsertAtCursor", () => {
		it("shows notice if no active markdown view", () => {
			const deps = makeDeps({
				lastMarkdownLeafRef: { current: null },
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleInsertAtCursor("content");
			});
			expect(mockNotice).toHaveBeenCalledWith(
				"⚠️ Open a note first to insert at cursor.",
			);
		});
	});

	describe("handleApply", () => {
		it("shows notice if no active markdown view", () => {
			const deps = makeDeps({
				lastMarkdownLeafRef: { current: null },
			});
			const { result } = renderHook(() => useMessageActions(deps));
			act(() => {
				result.current.handleApply("content");
			});
			expect(mockNotice).toHaveBeenCalledWith(
				"⚠️ Open a note first to apply edits.",
			);
		});
	});

	describe("handleSend — group chat path", () => {
		it("dispatches to orchestrator and adds user + assistant messages", async () => {
			const setSessions = vi.fn();
			const patchRuntime = vi.fn();
			const ui = makeDeps().ui;
			const mockStream = async function* () {
				yield {
					agentId: "a1",
					agentName: "Agent1",
					agentColor: "#ff0000",
					text: "response",
					toolCalls: undefined,
					tokenEstimate: 5,
					error: undefined,
				};
			};
			const orchestrator = {
				parseAndRoute: vi.fn().mockReturnValue({
					targets: [{ name: "Agent1" }],
				}),
				dispatch: vi.fn().mockReturnValue(mockStream()),
			};
			const session = {
				id: "session-1",
				messages: [],
				updatedAt: 0,
				title: "Test",
				createdAt: 1,
				contextItems: [],
			} as any;
			const deps = makeDeps({
				isGroupChat: true,
				orchestrator: orchestrator as any,
				activeSessionIdRef: { current: "session-1" },
				sessionsRef: { current: [session] },
				setSessions,
				patchRuntime,
				ui,
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleSend("hello");
			});
			expect(orchestrator.parseAndRoute).toHaveBeenCalledWith(
				"hello",
				[],
			);
			expect(patchRuntime).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({ isStreaming: true }),
			);
			expect(patchRuntime).toHaveBeenCalledWith(
				"session-1",
				expect.objectContaining({ isStreaming: false }),
			);
			expect(setSessions).toHaveBeenCalled();
		});

		it("does nothing if text is empty", async () => {
			const deps = makeDeps();
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleSend("  ");
			});
			expect(deps.setSessions).not.toHaveBeenCalled();
		});

		it("does nothing if controller is already active", async () => {
			const deps = makeDeps({
				getRuntime: vi.fn(() => ({
					...emptyChatRuntime,
					controller: { abort: vi.fn() } as any,
				})),
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleSend("hello");
			});
			expect(deps.setSessions).not.toHaveBeenCalled();
		});
	});

	describe("handleSend — agent slash commands", () => {
		it("routes agent slash commands through runChatTurn", async () => {
			const streamChat = vi.fn(async function* () {
				throw new Error("agent slash command used streamChat");
			});
			const agentProfile = {
				id: "agent-profile",
				name: "Agent",
				provider: "agent",
				model: "agent-model",
				endpointUrl: "https://agent.example.test",
				apiKey: "token",
			} as any;
			const session = {
				id: "session-1",
				messages: [],
				updatedAt: 0,
				title: "Test",
				createdAt: 1,
				contextItems: [],
			} as any;

			mockParseSlashCommand.mockReturnValue({
				command: "create",
				target: "new-note",
				prompt: "Write the note",
			});
			mockRunChatTurn.mockImplementation(async (options: any) => {
				options.onTextDelta("Generated note");
				return { text: "Generated note", tokenEstimate: 12 };
			});

			const deps = makeDeps({
				plugin: {
					...mockPlugin,
					chatapi: { streamChat },
					settings: {
						...mockPlugin.settings,
						providerProfiles: [agentProfile],
					},
				} as any,
				resolvedProfile: agentProfile,
				ui: {
					...makeDeps().ui,
					selectedProfileIds: new Set([agentProfile.id]),
				},
				sessionsRef: { current: [session] },
			});
			const { result } = renderHook(() => useMessageActions(deps));

			await act(async () => {
				await result.current.handleSend(
					"/create new-note Write the note",
				);
			});

			expect(mockRunChatTurn).toHaveBeenCalled();
			expect(streamChat).not.toHaveBeenCalled();
			expect(mockCreate).toHaveBeenCalledWith(
				"new-note.md",
				"Generated note",
			);
		});
	});

	describe("tool approval lifecycle", () => {
		it("reuses the turn ToolExecutor when approval resumes a turn", async () => {
			const toolCall = {
				toolCallId: "tc1",
				toolName: "read_note",
				args: { path: "test.md" },
			};
			mockRunChatTurn.mockImplementation(async (options: any) => {
				options.onTextDelta("Before approval");
				await options.requestApproval(toolCall);
				return { text: "After approval", tokenEstimate: 12 };
			});
			const session = {
				id: "session-1",
				messages: [],
				updatedAt: 0,
				title: "Test",
				createdAt: 1,
				contextItems: [],
			} as any;
			const deps = makeDeps({
				plugin: {
					...mockPlugin,
					settings: {
						...mockPlugin.settings,
						enableAgentTools: true,
					},
				} as any,
				sessionsRef: { current: [session] },
				ui: {
					...makeDeps().ui,
					selectedProfileIds: new Set(["p1"]),
				},
			});
			const { result } = renderHook(() => useMessageActions(deps));
			const sendPromise = result.current.handleSend("hello");

			await vi.waitFor(() => {
				expect(deps.getRuntime("session-1").pendingToolCall).toEqual(
					toolCall,
				);
			});
			await act(async () => {
				await result.current.handleApproveTool();
			});
			await act(async () => {
				await sendPromise;
			});

			expect(mockToolExecutorInstances).toHaveLength(1);
			expect(mockToolExecutorInstances[0].execute).toHaveBeenCalledWith(
				toolCall,
			);
		});
	});

	describe("handleSend — single chat remote attribution", () => {
		it("attributes remote user messages in history", async () => {
			const streamChat = vi.fn(async function* () {
				yield "response";
			});
			const messages = [
				{
					id: "m1",
					role: "user" as const,
					content: "Hello",
					timestamp: 1,
				},
				{
					id: "m2",
					role: "user" as const,
					content: "What do you think?",
					timestamp: 2,
					remote: true,
					fromUserId: "alice",
				},
			];
			const deps = makeDeps({
				plugin: {
					...mockPlugin,
					chatapi: { streamChat },
				} as any,
				activeSessionIdRef: { current: "session-1" },
				messagesRef: { current: messages },
				sessionsRef: {
					current: [
						{
							id: "session-1",
							messages,
							title: "Test",
							createdAt: 1,
							updatedAt: 1,
							contextItems: [],
						},
					],
				},
				ui: {
					...makeDeps().ui,
					selectedProfileIds: new Set(["p1"]),
				},
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleSend("Local message");
			});
			// Verify streamChat was called with attributed history
			expect(streamChat).toHaveBeenCalled();
			const history = (streamChat.mock.calls as any)[0][0];
			expect(history).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ content: "Hello" }),
					expect.objectContaining({
						content: "[Remote User alice]: What do you think?",
					}),
					expect.objectContaining({ content: "Local message" }),
				]),
			);
		});

		it("does not attribute local user messages", async () => {
			const streamChat = vi.fn(async function* () {
				yield "response";
			});
			const messages = [
				{
					id: "m1",
					role: "user" as const,
					content: "Local msg",
					timestamp: 1,
				},
			];
			const deps = makeDeps({
				plugin: {
					...mockPlugin,
					chatapi: { streamChat },
				} as any,
				activeSessionIdRef: { current: "session-1" },
				messagesRef: { current: messages },
				sessionsRef: {
					current: [
						{
							id: "session-1",
							messages,
							title: "Test",
							createdAt: 1,
							updatedAt: 1,
							contextItems: [],
						},
					],
				},
				ui: {
					...makeDeps().ui,
					selectedProfileIds: new Set(["p1"]),
				},
			});
			const { result } = renderHook(() => useMessageActions(deps));
			await act(async () => {
				await result.current.handleSend("Next");
			});
			const history = (streamChat.mock.calls as any)[0][0];
			expect(history).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ content: "Local msg" }),
				]),
			);
			expect(history).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						content: expect.stringContaining("[Remote User"),
					}),
				]),
			);
		});
	});
});
