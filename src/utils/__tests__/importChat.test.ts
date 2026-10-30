import { describe, expect, it } from "vitest";
import type { ChatSession } from "../../types";
import {
	serializeToJSON,
	serializeToJSONL,
	serializeToMarkdown,
} from "../exportChat";
import { makeImportedSessionsUnique, parseSessionArchive } from "../importChat";

const session: ChatSession = {
	id: "tagged-session",
	title: "Tagged session",
	createdAt: 100,
	updatedAt: 200,
	contextItems: [],
	tags: ["research-notes", "AI"],
	autoTagPending: false,
	messages: [
		{
			id: "message-1",
			role: "user",
			content: "Hello",
			timestamp: 150,
		},
	],
};

describe("saved chat export and import", () => {
	it("round-trips tags in single-session JSON exports", () => {
		const exported = serializeToJSON([session], "single");
		const imported = parseSessionArchive(exported);

		expect(imported).toHaveLength(1);
		expect(imported[0]).toMatchObject({
			id: session.id,
			title: session.title,
			tags: session.tags,
			messages: session.messages,
		});
	});

	it("round-trips tags in multi-session JSON exports", () => {
		const exported = serializeToJSON(
			[session, { ...session, id: "second" }],
			"all",
		);
		const imported = parseSessionArchive(exported);

		expect(imported.map((item) => item.tags)).toEqual([
			session.tags,
			session.tags,
		]);
	});

	it("round-trips tags in single-session JSONL exports", () => {
		const exported = serializeToJSONL([session], "single");
		const imported = parseSessionArchive(exported);

		expect(imported[0]).toMatchObject({
			id: session.id,
			tags: session.tags,
			messages: session.messages,
		});
	});

	it("round-trips tags in multi-session JSONL exports", () => {
		const exported = serializeToJSONL(
			[session, { ...session, id: "second" }],
			"all",
		);
		const imported = parseSessionArchive(exported);

		expect(imported.map((item) => item.tags)).toEqual([
			session.tags,
			session.tags,
		]);
	});

	it("keeps tags on zero-message JSONL sessions", () => {
		const emptySession = { ...session, messages: [] };
		const imported = parseSessionArchive(
			serializeToJSONL([emptySession], "single"),
		);

		expect(imported[0]).toMatchObject({
			id: session.id,
			tags: session.tags,
			messages: [],
		});
	});

	it("includes tags in both single and multi-session Markdown exports", () => {
		expect(serializeToMarkdown([session], "single")).toContain(
			'*Tags:* ["research-notes","AI"]',
		);
		expect(
			serializeToMarkdown([session, { ...session, id: "second" }], "all"),
		).toContain('*Tags:* ["research-notes","AI"]');
	});

	it("imports older message-only JSONL as an untagged session", () => {
		const legacyJsonl = JSON.stringify(session.messages[0]);
		const imported = parseSessionArchive(legacyJsonl, "Old export");

		expect(imported[0].title).toBe("Old export");
		expect(imported[0].tags).toEqual([]);
		expect(imported[0].messages).toEqual(session.messages);
	});

	it("assigns a new ID when an imported session conflicts with existing or archived IDs", () => {
		const result = makeImportedSessionsUnique(
			[session, { ...session, id: "second" }],
			new Set([session.id]),
			() => "imported-copy",
		);

		expect(result.copiedIdCount).toBe(1);
		expect(result.sessions.map((item) => item.id)).toEqual([
			"imported-copy",
			"second",
		]);
	});

	it("replaces unsafe imported IDs before persistence", () => {
		const unsafe = { ...session, id: "../../outside" };
		const imported = parseSessionArchive(JSON.stringify(unsafe));

		expect(imported[0].id).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
	});
});
