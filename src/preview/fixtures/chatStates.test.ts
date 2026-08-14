import { describe, expect, it } from "vitest";
import { chatFixtureStates, getChatFixture } from "./chatStates";

describe("chat fixtures", () => {
	it("covers every documented preview state", () => {
		expect(chatFixtureStates).toEqual([
			"empty",
			"normal",
			"streaming",
			"tool-approval",
			"error",
			"multi-agent",
			"relay-only",
			"mobile",
		]);
	});

	it("is deterministic and contains no live connection data", () => {
		expect(getChatFixture("normal")).toEqual(getChatFixture("normal"));
		expect(getChatFixture("relay-only").remoteUsers).toEqual([
			"FixtureUser",
			"remote-alice",
		]);
	});

	it("preserves the state-specific rendering signals", () => {
		expect(getChatFixture("error").messages.at(-1)?.isError).toBe(true);
		expect(getChatFixture("multi-agent").messages).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ agentId: "geometry" }),
				expect.objectContaining({ agentId: "strings" }),
			]),
		);
		expect(getChatFixture("relay-only").messages[0].remote).toBe(true);
	});
});
