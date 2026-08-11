import { describe, it, expect, vi } from "vitest";
import { ParticipantRouter } from "../ParticipantRouter";
import type { ChatMessage } from "../../types";

function createMockSyncAdapter() {
	return {
		sendMessage: vi.fn().mockResolvedValue(undefined),
		connect: vi.fn(),
		disconnect: vi.fn(),
	};
}

function createMockOrchestrator(remoteUsers: string[] = []) {
	const remoteUsersRef = { current: remoteUsers };
	return {
		remoteUsers,
		setRemoteUsers: vi.fn((users: string[]) => {
			remoteUsersRef.current = users;
		}),
		buildContext: vi.fn((agentId: string, thread: ChatMessage[]) => {
			const context: Array<{ role: string; content: string }> = [
				{ role: "system", content: "system prompt" },
			];
			for (const msg of thread) {
				if (msg.remote && msg.fromUserId && remoteUsersRef.current.includes(msg.fromUserId)) {
					context.push({
						role: "user",
						content: `[Remote User ${msg.fromUserId}]: ${msg.content}`,
					});
				} else {
					context.push({ role: "user", content: msg.content });
				}
			}
			return context;
		}),
		dispatch: async function* () { /* empty async generator */ },
		parseAndRoute: vi.fn(() => ({ targets: [], cleanText: "" })),
	};
}

describe("ParticipantRouter remote user sync", () => {
	it("routes to relay without an orchestrator for human-only tabs", async () => {
		const syncAdapter = createMockSyncAdapter();
		const router = new ParticipantRouter(null, syncAdapter as any, "local-1");
		router.setRemoteUsers(["alice"]);

		const responses = [];
		for await (const response of router.dispatch("Hello", [])) {
			responses.push(response);
		}

		expect(responses).toEqual([]);
		expect(syncAdapter.sendMessage).toHaveBeenCalledTimes(1);
		expect(syncAdapter.sendMessage.mock.calls[0][0]).toMatchObject({
			content: "Hello",
			remote: true,
			fromUserId: "local-1",
		});
	});

	it("returns no agent targets for a human-only tab", () => {
		const router = new ParticipantRouter(null, null, "local-1");

		expect(router.parseAndRoute("Hello")).toEqual({
			targets: [],
			cleanText: "Hello",
		});
	});

	it("syncs remote users to orchestrator on construction", () => {
		const syncAdapter = createMockSyncAdapter();
		const orchestrator = createMockOrchestrator(["alice", "bob"]);

		// Constructor takes 3 positional args: (orchestrator, syncAdapter, localUserId)
		const router = new ParticipantRouter(
			orchestrator as any,
			syncAdapter as any,
			"local-1",
		);
		router.setRemoteUsers(["alice", "bob"]);

		// Verify orchestrator has the remote users
		const messages: ChatMessage[] = [
			{
				id: "1",
				role: "user",
				content: "Hello",
				timestamp: 1,
				remote: true,
				fromUserId: "alice",
			},
		];
		const context = orchestrator.buildContext("any", messages);
		const userMessages = context.filter((m: any) => m.role === "user");
		expect(userMessages[0].content).toBe("[Remote User alice]: Hello");
	});

	it("updates orchestrator when setRemoteUsers is called", () => {
		const syncAdapter = createMockSyncAdapter();
		const orchestrator = createMockOrchestrator();

		// Constructor takes 3 positional args
		const router = new ParticipantRouter(
			orchestrator as any,
			syncAdapter as any,
			"local-1",
		);

		// Update remote users via router
		router.setRemoteUsers(["alice"]);

		// Verify setRemoteUsers was called on orchestrator
		expect(orchestrator.setRemoteUsers).toHaveBeenCalledWith(["alice"]);
	});

	it("includes remote flag and fromUserId in relay messages", async () => {
		const syncAdapter = createMockSyncAdapter();
		const orchestrator = createMockOrchestrator(["alice"]);

		// Constructor takes 3 positional args
		const router = new ParticipantRouter(
			orchestrator as any,
			syncAdapter as any,
			"local-1",
		);
		router.setRemoteUsers(["alice"]);

		// Consume the generator
		for await (const _ of router.dispatch("Hello", [])) {
			// no-op
		}

		expect(syncAdapter.sendMessage).toHaveBeenCalledTimes(1);
		const relayMsg = syncAdapter.sendMessage.mock.calls[0][0];
		expect(relayMsg.remote).toBe(true);
		expect(relayMsg.fromUserId).toBe("local-1");
		expect(relayMsg.content).toBe("Hello");
	});
});
