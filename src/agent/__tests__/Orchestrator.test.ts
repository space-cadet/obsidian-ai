import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../Orchestrator";
import type { ChatApiManager } from "../../api";
import type { GroupChatParticipant } from "../../types";

function createMockApiManager(): ChatApiManager {
	return {
		streamChat: vi.fn(),
		streamChatWithTools: vi.fn(),
		getClient: vi.fn(),
		abort: vi.fn(),
	} as unknown as ChatApiManager;
}

function createParticipant(
	id: string,
	name: string,
	profileId: string,
): GroupChatParticipant {
	return { id, name, profileId, color: "#4285f4" };
}

describe("Orchestrator remote user context", () => {
	it("includes remote users in system prompt", async () => {
		const api = createMockApiManager();
		const participants = [
			createParticipant("gemini", "Gemini", "gemini-profile"),
		];
		const orchestrator = new Orchestrator({
			api,
			participants,
			remoteUsers: ["alice", "bob"],
		});

		// Access private method via any cast for testing
		const prompt = (orchestrator as any).buildSystemPrompt("gemini");
		expect(prompt).toContain("[Participants]");
		expect(prompt).toContain("AI assistants: Gemini");
		expect(prompt).toContain("Remote users: alice, bob");
	});

	it("does not include remote users section when empty", async () => {
		const api = createMockApiManager();
		const participants = [
			createParticipant("gemini", "Gemini", "gemini-profile"),
		];
		const orchestrator = new Orchestrator({
			api,
			participants,
			remoteUsers: [],
		});

		const prompt = (orchestrator as any).buildSystemPrompt("gemini");
		expect(prompt).toContain("[Participants]");
		expect(prompt).toContain("AI assistants: Gemini");
		expect(prompt).not.toContain("Remote users:");
	});

	it("attributes remote user messages in buildContext", async () => {
		const api = createMockApiManager();
		const participants = [
			createParticipant("gemini", "Gemini", "gemini-profile"),
		];
		const orchestrator = new Orchestrator({
			api,
			participants,
			remoteUsers: ["alice"],
		});

		const messages = [
			{ id: "1", role: "user" as const, content: "Hello", timestamp: 1 },
			{
				id: "2",
				role: "user" as const,
				content: "What do you think?",
				timestamp: 2,
				remote: true,
				fromUserId: "alice",
			},
		];

		const context = (orchestrator as any).buildContext(
			"gemini",
			messages,
			"",
		);
		expect(context).toHaveLength(4); // system + 2 messages + user input
		expect(context[1].content).toBe("Hello");
		expect(context[2].content).toBe(
			"[Remote User alice]: What do you think?",
		);
	});

	it("does not attribute non-remote user messages", async () => {
		const api = createMockApiManager();
		const participants = [
			createParticipant("gemini", "Gemini", "gemini-profile"),
		];
		const orchestrator = new Orchestrator({
			api,
			participants,
			remoteUsers: ["alice"],
		});

		const messages = [
			{
				id: "1",
				role: "user" as const,
				content: "Local message",
				timestamp: 1,
			},
		];

		const context = (orchestrator as any).buildContext(
			"gemini",
			messages,
			"",
		);
		expect(context[1].content).toBe("Local message");
	});

	it("does not attribute remote messages from unknown users", async () => {
		const api = createMockApiManager();
		const participants = [
			createParticipant("gemini", "Gemini", "gemini-profile"),
		];
		const orchestrator = new Orchestrator({
			api,
			participants,
			remoteUsers: ["alice"], // bob is NOT in the list
		});

		const messages = [
			{
				id: "1",
				role: "user" as const,
				content: "From Bob",
				timestamp: 1,
				remote: true,
				fromUserId: "bob",
			},
		];

		const context = (orchestrator as any).buildContext(
			"gemini",
			messages,
			"",
		);
		expect(context[1].content).toBe("From Bob"); // Not attributed since bob not in remoteUsers
	});

	it("allows setRemoteUsers to update after construction", async () => {
		const api = createMockApiManager();
		const orchestrator = new Orchestrator({
			api,
			participants: [],
			remoteUsers: [],
		});

		orchestrator.setRemoteUsers(["charlie"]);

		const messages = [
			{
				id: "1",
				role: "user" as const,
				content: "Hi",
				timestamp: 1,
				remote: true,
				fromUserId: "charlie",
			},
		];

		const context = (orchestrator as any).buildContext(
			"gemini",
			messages,
			"",
		);
		expect(context[1].content).toBe("[Remote User charlie]: Hi");
	});

	it("replays resolved attachment parts in group context", () => {
		const orchestrator = new Orchestrator({
			api: createMockApiManager(),
			participants: [
				createParticipant("gemini", "Gemini", "gemini-profile"),
			],
		});
		const parts = [{ type: "image" as const, image: "base64-image" }];
		const context = (orchestrator as any).buildContext(
			"gemini",
			[
				{
					id: "1",
					role: "user",
					content: "Describe this",
					timestamp: 1,
					resolvedParts: parts,
				},
			],
			"Follow up",
			parts,
		);

		expect(context[1].content).toEqual([
			{ type: "text", text: "Describe this" },
			...parts,
		]);
		expect(context[2].content).toEqual([
			{ type: "text", text: "Follow up" },
			...parts,
		]);
	});
});

describe("Orchestrator tool calling", () => {
	function createToolExecutor(execute: ReturnType<typeof vi.fn>) {
		return {
			getModelTools: vi.fn().mockReturnValue({ read_note: {} }),
			getResolvedToolRegistry: vi.fn().mockReturnValue({ definitions: [] }),
			execute,
		} as any;
	}

	function createOrchestrator(
		api: ChatApiManager,
		toolExecutor: any,
		autoApprove: boolean,
	) {
		return new Orchestrator({
			api,
			participants: [
				createParticipant("one", "Agent One", "one-profile"),
				createParticipant("two", "Agent Two", "two-profile"),
			],
			mode: "sequential",
			enableTools: true,
			autoApprove,
			toolExecutor,
			maxSteps: 2,
		});
	}

	it("executes an approved tool call for each sequential agent", async () => {
		const api = createMockApiManager();
		const execute = vi.fn().mockResolvedValue({
			success: true,
			content: "# Note from the vault",
		});
		(api.streamChatWithTools as ReturnType<typeof vi.fn>)
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-one",
						toolName: "read_note",
						args: { path: "Note" },
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "Agent One found the note." };
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "Agent Two reviewed the finding." };
			});

		const orchestrator = createOrchestrator(
			api,
			createToolExecutor(execute),
			true,
		);
		const responses = [];
		for await (const response of orchestrator.dispatch("Review the note", [])) {
			responses.push(response);
		}

		expect(execute).toHaveBeenCalledOnce();
		expect(execute).toHaveBeenCalledWith(
		{
			toolCallId: "call-one",
			toolName: "read_note",
			args: { path: "Note" },
		},
			expect.anything(),
		);
		expect(responses[0].toolCalls?.[0].result?.content).toBe(
			"# Note from the vault",
		);
		expect(responses[1].text).toBe("Agent Two reviewed the finding.");
		const secondAgentMessages = (api.streamChatWithTools as any).mock.calls[2][0];
		expect(secondAgentMessages.some((message: any) =>
			JSON.stringify(message).includes("Agent One found the note."),
		)).toBe(true);
	});

	it("returns a clear rejection result when group-chat approval is disabled", async () => {
		const api = createMockApiManager();
		const execute = vi.fn();
		(api.streamChatWithTools as ReturnType<typeof vi.fn>)
			.mockImplementationOnce(async function* () {
				yield {
					type: "tool-call",
					call: {
						toolCallId: "call-rejected",
						toolName: "edit_note",
						args: { path: "Note", content: "Changed" },
					},
				};
			})
			.mockImplementationOnce(async function* () {
				yield { type: "text-delta", text: "No edit was made." };
			});

		const orchestrator = createOrchestrator(
			api,
			createToolExecutor(execute),
			false,
		);
		const responses = [];
		for await (const response of orchestrator.dispatch("Edit the note", [])) {
			responses.push(response);
		}

		expect(execute).not.toHaveBeenCalled();
		expect(responses[0].toolCalls?.[0].result?.error).toContain(
			"manual approval is not supported in group chat",
		);
	});
});
