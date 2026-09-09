import { describe, expect, it } from "vitest";
import { projectToolResultForModel } from "../toolResultProjection";

describe("projectToolResultForModel", () => {
	it("adds an exact-retrieval reference when the envelope fits", () => {
		const result = projectToolResultForModel({
			text: "HEAD-" + "x".repeat(2000) + "-TAIL",
			call: {
				toolCallId: "call-large",
				toolName: "read_note",
				args: { path: "Large note" },
			},
			result: {
				success: true,
				content: "HEAD-" + "x".repeat(2000) + "-TAIL",
			},
			maxTokens: 100,
			sessionId: "session-1",
		});

		expect(result.truncated).toBe(true);
		expect(result.reference).toMatchObject({
			session_id: "session-1",
			tool_call_id: "call-large",
		});
		expect(result.text).toContain("read_tool_result");
		expect(result.text).toContain("content_length");
	});

	it("keeps a bounded preview when a tiny budget cannot fit the reference", () => {
		const result = projectToolResultForModel({
			text: "HEAD-" + "x".repeat(200) + "-TAIL",
			call: {
				toolCallId: "call-small",
				toolName: "read_note",
				args: { path: "Small budget" },
			},
			result: { content: "large result" },
			maxTokens: 20,
			sessionId: "session-1",
		});

		expect(result.truncated).toBe(true);
		expect(result.reference).toBeUndefined();
		expect(result.text).toContain("HEAD-");
		expect(result.text).toContain("-TAIL");
	});
});
