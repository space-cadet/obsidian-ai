import { describe, it, expect } from "vitest";
import type { ContentPart } from "../../types";
import {
	appendPendingText,
	getRemainingText,
	finalizeContentParts,
} from "../streamingUtils";

describe("appendPendingText", () => {
	it("appends pending text as a new text part", () => {
		const result = appendPendingText("hello world", 6, []);
		expect(result.parts).toEqual([{ type: "text", content: "world" }]);
		expect(result.checkpoint).toBe(11);
	});

	it("returns unchanged when no pending text", () => {
		const parts = [{ type: "text" as const, content: "hello" }];
		const result = appendPendingText("hello", 5, parts);
		expect(result.parts).toEqual(parts);
		expect(result.checkpoint).toBe(5);
	});

	it("appends to existing parts", () => {
		const parts = [{ type: "text" as const, content: "hello " }];
		const result = appendPendingText("hello world", 6, parts);
		expect(result.parts).toHaveLength(2);
		expect(result.parts[1]).toEqual({ type: "text", content: "world" });
		expect(result.checkpoint).toBe(11);
	});

	it("handles empty fullText", () => {
		const result = appendPendingText("", 0, []);
		expect(result.parts).toEqual([]);
		expect(result.checkpoint).toBe(0);
	});
});

describe("getRemainingText", () => {
	it("returns text after last occurrence of lastTextPart", () => {
		expect(getRemainingText("hello world foo", "world ")).toBe("foo");
	});

	it("returns full content when lastTextPart not found", () => {
		expect(getRemainingText("hello world", "xyz")).toBe("hello world");
	});

	it("returns empty string when lastTextPart matches at end", () => {
		expect(getRemainingText("hello world", "world")).toBe("");
	});

	it("returns full content when lastTextPart is empty", () => {
		expect(getRemainingText("hello", "")).toBe("hello");
	});

	it("handles repeated occurrences (uses lastIndexOf)", () => {
		expect(getRemainingText("abc abc abc", "abc ")).toBe("abc");
	});
});

describe("finalizeContentParts", () => {
	it("appends pending text and additional parts", () => {
		const result = finalizeContentParts(
			"hello world",
			6,
			[{ type: "text", content: "hello " }],
			[{ type: "text", content: "extra" }],
		);
		expect(result).toHaveLength(3);
		expect(result[1]).toEqual({ type: "text", content: "world" });
		expect(result[2]).toEqual({ type: "text", content: "extra" });
	});

	it("only appends additional parts when no pending text", () => {
		const result = finalizeContentParts(
			"hello",
			5,
			[{ type: "text", content: "hello" }],
			[{ type: "text", content: "bye" }],
		);
		expect(result).toHaveLength(2);
		expect(result[1]).toEqual({ type: "text", content: "bye" });
	});

	it("returns just existing parts when nothing to append", () => {
		const existing: ContentPart[] = [{ type: "text", content: "hello" }];
		const result = finalizeContentParts("hello", 5, existing);
		expect(result).toEqual(existing);
	});
});
