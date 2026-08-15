import type { ChatMessage, ChatSession } from "../../types";

export type ChatFixtureState =
	| "empty"
	| "normal"
	| "streaming"
	| "tool-approval"
	| "error"
	| "multi-agent"
	| "relay-only"
	| "mobile";

const timestamp = 1_754_000_000_000;

const message = (
	role: ChatMessage["role"],
	content: string,
	partial: Partial<ChatMessage> = {},
): ChatMessage => ({
	id: `${role}-${partial.fromUserId ?? partial.agentId ?? "fixture"}-${content.slice(0, 12)}`,
	role,
	content,
	timestamp,
	...partial,
});

const baseSession = (messages: ChatMessage[] = []): ChatSession => ({
	id: "fixture-session",
	title: "Fixture conversation",
	createdAt: timestamp,
	updatedAt: timestamp,
	messages,
	contextItems: [],
	profileId: "fixture-openai",
});

/** Deterministic, network-free sessions used by the standalone UI preview. */
export function getChatFixture(state: ChatFixtureState): ChatSession {
	switch (state) {
		case "empty":
			return baseSession();
		case "normal":
			return baseSession([
				message("user", "Summarize the second law of thermodynamics."),
				message(
					"assistant",
					"Entropy of an isolated system does not decrease over time.",
					{ modelName: "Fixture GPT" },
				),
			]);
		case "streaming":
			return baseSession([
				message("user", "Explain quantum error correction."),
				message(
					"assistant",
					"A logical qubit can be protected by spreading",
					{
						modelName: "Fixture GPT",
					},
				),
			]);
		case "tool-approval":
			return baseSession([
				message(
					"user",
					"Read my research note and extract the key claims.",
					{
						contextItems: [
							{
								id: "note-1",
								type: "note",
								path: "Research.md",
								name: "Research",
							},
						],
					},
				),
			]);
		case "error":
			return baseSession([
				message("user", "Try the unavailable provider."),
				message(
					"assistant",
					"The provider request failed. Please check the connection.",
					{
						isError: true,
					},
				),
			]);
		case "multi-agent":
			return baseSession([
				message(
					"user",
					"Compare geometric and string-theoretic viewpoints.",
				),
				message(
					"assistant",
					"The geometric viewpoint begins with quantized areas.",
					{
						agentId: "geometry",
						agentName: "Geometry",
						agentColor: "#6d9eeb",
					},
				),
				message(
					"assistant",
					"The string viewpoint begins with extended excitations.",
					{
						agentId: "strings",
						agentName: "Strings",
						agentColor: "#e06666",
					},
				),
			]);
		case "relay-only":
			return {
				...baseSession([
					message(
						"user",
						"I found a useful connection to spin networks.",
						{
							remote: true,
							fromUserId: "remote-alice",
						},
					),
				]),
				relayEnabled: true,
				remoteUsers: ["FixtureUser", "remote-alice"],
			};
		case "mobile":
			return {
				...getChatFixture("normal"),
				id: "fixture-mobile-session",
				title: "Mobile fixture",
				scrollPosition: 240,
			};
	}
}

export const chatFixtureStates: readonly ChatFixtureState[] = [
	"empty",
	"normal",
	"streaming",
	"tool-approval",
	"error",
	"multi-agent",
	"relay-only",
	"mobile",
];
