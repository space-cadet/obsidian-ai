import { describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { runChatTurn } from "../ChatTurnCoordinator";

const { agentLoopRun } = vi.hoisted(() => ({
	agentLoopRun: vi.fn(),
}));

vi.mock("../AgentLoop", () => ({
	AgentLoop: class {
		run = agentLoopRun;
	},
}));

vi.mock("../OpenResponsesLoop", () => ({
	OpenResponsesLoop: vi.fn(),
}));

vi.mock("../../api/AgentApiManager", () => ({
	AgentApiManager: vi.fn(),
}));

describe("runChatTurn", () => {
	it("runs the native protocol from a React-free coordinator", async () => {
		agentLoopRun.mockResolvedValueOnce({
			text: "Done",
			tokenEstimate: 12,
		});

		const result = await runChatTurn({
			profile: {
				id: "profile-1",
				name: "OpenAI",
				provider: "openai",
				model: "gpt-test",
				createdAt: 0,
				updatedAt: 0,
			},
			app: {} as App,
			chatApi: {} as never,
			toolExecutor: {} as never,
			toolRegistry: { definitions: [], tools: {}, byId: new Map() },
			messages: [],
			signal: new AbortController().signal,
			maxSteps: 4,
			autoApprove: false,
			maxRequestTokens: 1000,
			maxContextMessages: 20,
			preserveRecentMessages: 8,
			requestResponseReserveTokens: 200,
			maxToolResultTokens: 400,
			thinkingEnabled: false,
			onTextDelta: vi.fn(),
			onToolCall: vi.fn(),
			requestApproval: vi.fn(),
			onToolResult: vi.fn(),
			onTokenUpdate: vi.fn(),
		});

		expect(result).toEqual({ text: "Done", tokenEstimate: 12 });
		expect(agentLoopRun).toHaveBeenCalledWith(
			[],
			{},
			expect.any(AbortSignal),
		);
	});
});
