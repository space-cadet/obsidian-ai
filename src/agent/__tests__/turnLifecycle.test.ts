import { describe, expect, it, vi } from "vitest";
import { TurnLifecycle, type TurnLifecycleDeps } from "../turnLifecycle";
import type { ChatSession } from "../../types";

function makeSession(): ChatSession {
	return {
		id: "session-1",
		title: "Compaction test",
		createdAt: 0,
		updatedAt: 0,
		contextItems: [],
		messages: Array.from({ length: 6 }, (_, index) => ({
			id: `message-${index}`,
			role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
			content: `Message ${index}`,
			timestamp: index,
		})),
	};
}

describe("TurnLifecycle compaction command", () => {
	it("runs a manual compaction and saves fenced JSON output", async () => {
		let sessions = [makeSession()];
		const sessionsRef = { current: sessions };
		const callApi = vi.fn().mockResolvedValue(
			[
				"```json",
				JSON.stringify({
					keyDecisions: ["Keep the transcript"],
					toolResults: [],
					userIntent: ["Test compaction"],
					openQuestions: [],
				}),
				"```",
			].join("\n"),
		);
		const deps = {
			plugin: {
				settings: { preserveRecentMessages: 3 },
				chatapi: { callApi },
			} as any,
			orchestrator: null,
			participantRouter: null,
			resolvedProfile: {
				id: "profile-1",
				name: "Test",
				provider: "openai",
				model: "test-model",
				createdAt: 0,
				updatedAt: 0,
			},
			isGroupChat: false,
			participants: [],
			thinkingEnabled: false,
			sessionsRef,
			activeSessionIdRef: { current: "session-1" },
			setSessions: (update: any) => {
				sessions =
					typeof update === "function" ? update(sessions) : update;
				sessionsRef.current = sessions;
			},
			getRuntime: () => ({ controller: null }) as any,
			patchRuntime: vi.fn(),
			clearRuntime: vi.fn(),
			setWasTruncated: vi.fn(),
			setContextTokenCount: vi.fn(),
			setContextItems: vi.fn(),
			messagesRef: { current: sessions[0].messages },
			contextItemsRef: { current: [] },
			ui: {} as any,
		} as unknown as TurnLifecycleDeps;
		const lifecycle = new TurnLifecycle(() => deps);

		await lifecycle.send("!debug compact");

		expect(callApi).toHaveBeenCalledOnce();
		expect(sessions[0].compactionMetadata).toMatchObject({
			sourceMessageIds: ["message-0", "message-1", "message-2"],
			summary: {
				keyDecisions: ["Keep the transcript"],
				userIntent: ["Test compaction"],
			},
		});
		expect(sessions[0].messages).toHaveLength(7);
		expect(sessions[0].messages[6]).toMatchObject({
			isDebug: true,
			content: expect.stringContaining("Summary validated and saved"),
		});
	});

	it("logs actionable bounded diagnostics when compaction is rejected", async () => {
		const sessions = [makeSession()];
		const logger = { log: vi.fn() };
		const deps = {
			plugin: {
				settings: { preserveRecentMessages: 3 },
				chatapi: {
					callApi: vi
						.fn()
						.mockResolvedValue(
							JSON.stringify({ summary: "wrong shape" }),
						),
				},
				logger,
			} as any,
			orchestrator: null,
			participantRouter: null,
			resolvedProfile: {
				id: "profile-1",
				name: "Test",
				provider: "openai",
				model: "test-model",
				createdAt: 0,
				updatedAt: 0,
			},
			isGroupChat: false,
			participants: [],
			thinkingEnabled: false,
			sessionsRef: { current: sessions },
			activeSessionIdRef: { current: "session-1" },
			setSessions: vi.fn(),
			getRuntime: () => ({ controller: null }) as any,
			patchRuntime: vi.fn(),
			clearRuntime: vi.fn(),
			setWasTruncated: vi.fn(),
			setContextTokenCount: vi.fn(),
			setContextItems: vi.fn(),
			messagesRef: { current: sessions[0].messages },
			contextItemsRef: { current: [] },
			ui: {} as any,
		} as unknown as TurnLifecycleDeps;
		const lifecycle = new TurnLifecycle(() => deps);

		await lifecycle.send("!debug compact");

		expect(logger.log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("failure=invalid-schema"),
		);
		expect(logger.log).toHaveBeenCalledWith(
			"error",
			expect.stringContaining("schemaIssues="),
		);
	});
});
