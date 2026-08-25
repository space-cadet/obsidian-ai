import { describe, expect, it } from "vitest";
import { ContinuationStore, requestFingerprint } from "../pagination";

describe("ContinuationStore", () => {
	it("returns stable pages and an opaque next cursor", () => {
		const store = new ContinuationStore();
		const fingerprint = requestFingerprint("search_notes", {
			query: "note",
			sort_by: "name",
		});

		const first = store.page({
			toolName: "search_notes",
			fingerprint,
			items: ["a", "b", "c"],
			limit: 2,
		});
		expect(first).toEqual({
			items: ["a", "b"],
			hasMore: true,
			nextCursor: expect.any(String),
			total: 3,
		});

		const second = store.page({
			toolName: "search_notes",
			fingerprint,
			items: [],
			limit: 2,
			cursor: (first as any).nextCursor,
		});
		expect(second).toEqual({
			items: ["c"],
			hasMore: false,
			nextCursor: undefined,
			total: 3,
		});
	});

	it("rejects a cursor used with different filters", () => {
		const store = new ContinuationStore();
		const first = store.page({
			toolName: "search_notes",
			fingerprint: "query:a",
			items: ["a", "b"],
			limit: 1,
		});

		const result = store.page({
			toolName: "search_notes",
			fingerprint: "query:b",
			items: [],
			limit: 1,
			cursor: (first as any).nextCursor,
		});
		expect(result).toEqual({
			error: "Continuation cursor does not match this tool request. Start the search again with the original filters.",
		});
	});
});
