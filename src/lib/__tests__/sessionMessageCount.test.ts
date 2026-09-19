import { describe, expect, it } from "vitest";
import type { ChatSession } from "../../types";
import { sessionMessageCount } from "../sessionUtils";

function makeSession(overrides: Partial<ChatSession>): ChatSession {
	return {
		id: "s1",
		title: "Test",
		createdAt: 1,
		updatedAt: 2,
		messages: [],
		contextItems: [],
		...overrides,
	};
}

describe("sessionMessageCount", () => {
	it("uses the cached index count while unhydrated", () => {
		const s = makeSession({ hydrated: false, messageCount: 5 });
		expect(sessionMessageCount(s)).toBe(5);
	});

	it("uses the live array once hydrated, even if messageCount is set", () => {
		const s = makeSession({
			hydrated: true,
			messageCount: 5,
			messages: [
				{
					id: "m1",
					role: "user",
					content: "hi",
					timestamp: 1,
				},
			],
		});
		expect(sessionMessageCount(s)).toBe(1);
	});

	it("counts a fresh draft as zero", () => {
		expect(sessionMessageCount(makeSession({}))).toBe(0);
	});

	it("ignores a stale cached count once messages are in memory", () => {
		// Defensive: any session carrying messages must report their length,
		// regardless of hydration flags (e.g. sync-downloaded replacements).
		const s = makeSession({
			hydrated: false,
			messageCount: 9,
			messages: [
				{ id: "m1", role: "user", content: "a", timestamp: 1 },
				{ id: "m2", role: "assistant", content: "b", timestamp: 2 },
			],
		});
		expect(sessionMessageCount(s)).toBe(2);
	});
});
