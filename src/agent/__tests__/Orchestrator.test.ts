import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../Orchestrator";
import type { ChatApiManager } from "../../api/AgentApiManager";
import type { GroupChatParticipant } from "../../types";

function createMockApiManager(): ChatApiManager {
	return {
		streamChat: vi.fn(),
		streamChatWithTools: vi.fn(),
		getClient: vi.fn(),
		abort: vi.fn(),
	} as unknown as ChatApiManager;
}

describe("Orchestrator remote user context", () => {
	it("includes remote users in system prompt", async () => {
		const api = createMockApiManager();
		const participants: GroupChatParticipant[] = [
			{
				id: "gemini",
				name: "Gemini",
				profileId: "gemini-profile",
				provider: "gemini",
				model: "gemini-2.5-flash",
			},
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
		const participants: GroupChatParticipant[] = [
			{
				id: "gemini",
				name: "Gemini",
				profileId: "gemini-profile",
				provider: "gemini",
				model: "gemini-2.5-flash",
			},
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
		const participants: GroupChatParticipant[] = [
			{
				id: "gemini",
				name: "Gemini",
				profileId: "gemini-profile",
				provider: "gemini",
				model: "gemini-2.5-flash",
			},
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

		const context = (orchestrator as any).buildContext("gemini", messages, "");
		expect(context).toHaveLength(4); // system + 2 messages + user input
		expect(context[1].content).toBe("Hello");
		expect(context[2].content).toBe("[Remote User alice]: What do you think?");
	});

	it("does not attribute non-remote user messages", async () => {
		const api = createMockApiManager();
		const participants: GroupChatParticipant[] = [
			{
				id: "gemini",
				name: "Gemini",
				profileId: "gemini-profile",
				provider: "gemini",
				model: "gemini-2.5-flash",
			},
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

		const context = (orchestrator as any).buildContext("gemini", messages, "");
		expect(context[1].content).toBe("Local message");
	});

	it("does not attribute remote messages from unknown users", async () => {
		const api = createMockApiManager();
		const participants: GroupChatParticipant[] = [
			{
				id: "gemini",
				name: "Gemini",
				profileId: "gemini-profile",
				provider: "gemini",
				model: "gemini-2.5-flash",
			},
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

		const context = (orchestrator as any).buildContext("gemini", messages, "");
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

		const context = (orchestrator as any).buildContext("gemini", messages, "");
		expect(context[1].content).toBe("[Remote User charlie]: Hi");
	});
});
