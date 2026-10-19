import { describe, expect, it, vi } from "vitest";
import { checkDataHealth } from "../dataHealth";
const root = ".obsidian/plugins/chat-lab";
const message = { id: "m", role: "user", content: "PRIVATE MESSAGE" };
const memory = {
	id: "m",
	content: "PRIVATE MEMORY",
	category: "user_fact",
	timestamp: "2026-10-19",
	tags: [],
};
function fixture(extra: Record<string, unknown> = {}) {
	const files: Record<string, string> = Object.fromEntries(
		Object.entries({
			"manifest.json": { id: "chat-lab", version: "1.7.1" },
			"main.js": "code",
			"styles.css": "css",
			"data.json": {},
			"sessions/index.json": {
				version: 1,
				sessions: [
					{ id: "s", filePath: "sessions/s.jsonl", messageCount: 1 },
				],
				activeSessionId: "s",
				openSessionIds: ["s"],
			},
			"sessions/s.jsonl": JSON.stringify(message),
			...extra,
		}).map(([k, v]) => [
			`${root}/${k}`,
			typeof v === "string" ? v : JSON.stringify(v),
		]),
	);
	const adapter = {
		exists: vi.fn(
			async (p: string) =>
				p in files ||
				Object.keys(files).some((f) => f.startsWith(p + "/")),
		),
		read: vi.fn(async (p: string) => {
			if (!(p in files)) throw new Error("PRIVATE ERROR");
			return files[p];
		}),
		stat: vi.fn(async (p: string) =>
			p in files ? { type: "file", size: files[p].length } : null,
		),
		list: vi.fn(async (p: string) => ({
			files: Object.keys(files).filter(
				(f) =>
					f.startsWith(p + "/") &&
					!f.slice(p.length + 1).includes("/"),
			),
			folders: [],
		})),
		write: vi.fn(),
		remove: vi.fn(),
		mkdir: vi.fn(),
	};
	return {
		adapter,
		files,
		run: () => checkDataHealth(adapter, root, "chat-lab"),
	};
}
const codes = (r: Awaited<ReturnType<typeof checkDataHealth>>) =>
	r.findings.map((f) => f.code);
describe("read-only data health", () => {
	it("accepts a healthy store without writes or leaking content", async () => {
		const { adapter, run } = fixture({
			"intelligence/memory.json": [memory],
		});
		const report = await run();
		expect(report.counts).toEqual({ error: 0, warning: 0, info: 0 });
		expect(adapter.write).not.toHaveBeenCalled();
		expect(adapter.remove).not.toHaveBeenCalled();
		expect(adapter.mkdir).not.toHaveBeenCalled();
		expect(JSON.stringify(report)).not.toContain("PRIVATE");
	});
	it("reports malformed JSONL, duplicate IDs, schema errors and count mismatches", async () => {
		const { run } = fixture({
			"sessions/s.jsonl": [
				JSON.stringify(message),
				JSON.stringify(message),
				"{bad",
				JSON.stringify({ id: "bad", role: "user", content: null }),
			].join("\n"),
		});
		const report = await run();
		expect(codes(report)).toEqual(
			expect.arrayContaining([
				"duplicate-message-id",
				"invalid-jsonl",
				"invalid-message",
				"message-count-mismatch",
			]),
		);
		expect(
			report.findings.find((f) => f.code === "invalid-jsonl")?.line,
		).toBe(3);
		expect(JSON.stringify(report)).not.toContain("PRIVATE MESSAGE");
	});
	it("detects missing indexed files, duplicate sessions, stale tabs and unindexed transcripts", async () => {
		const { run, files } = fixture({
			"sessions/orphan.jsonl": JSON.stringify(message),
			"sessions/index.json": {
				version: 1,
				sessions: [
					{
						id: "s",
						filePath: "sessions/missing.jsonl",
						messageCount: 1,
					},
					{
						id: "s",
						filePath: "sessions/missing.jsonl",
						messageCount: 1,
					},
				],
				activeSessionId: "gone",
				openSessionIds: ["gone", "gone"],
			},
		});
		delete files[`${root}/sessions/s.jsonl`];
		expect(codes(await run())).toEqual(
			expect.arrayContaining([
				"missing-transcript",
				"duplicate-session-id",
				"shared-transcript",
				"unknown-active-session",
				"unknown-tab",
				"duplicate-tab",
				"unindexed-transcript",
			]),
		);
	});
	it("never follows unsafe transcript paths", async () => {
		const { adapter, run } = fixture({
			"sessions/index.json": {
				sessions: [
					{ id: "s", filePath: "../private.json", messageCount: 1 },
				],
			},
		});
		expect(codes(await run())).toContain("invalid-path");
		expect(
			adapter.read.mock.calls.every(
				([p]) => p.startsWith(root + "/") && !p.includes(".."),
			),
		).toBe(true);
	});
	it("reports bad settings/index JSON and missing assets without crashing", async () => {
		const { run, files } = fixture({
			"data.json": "{",
			"sessions/index.json": "null",
		});
		delete files[`${root}/main.js`];
		expect(codes(await run())).toEqual(
			expect.arrayContaining([
				"invalid-json",
				"invalid-session-index",
				"missing-plugin-file",
			]),
		);
	});
	it("checks legacy transcripts without requiring a JSONL index", async () => {
		const { run, files } = fixture({
			"data.json": {
				chatData: { sessions: [{ messages: [message, message] }] },
			},
		});
		delete files[`${root}/sessions/index.json`];
		delete files[`${root}/sessions/s.jsonl`];
		expect(codes(await run())).toEqual(["duplicate-message-id"]);
	});
	it("validates memory entries, duplicate IDs, tiers and audit records", async () => {
		const scored = {
			...memory,
			score: 0.5,
			accessCount: 0,
			createdAt: "2026-10-19",
			lastAccessed: "2026-10-19",
		};
		const { run } = fixture({
			"intelligence/memory.json": [memory, memory, {}],
			"intelligence/core.json": [scored],
			"intelligence/staged.json": [scored],
			"intelligence/archive.json": {},
			"intelligence/memory-audit.jsonl": "{}\n{bad",
			"intelligence/memory-metadata.json": {},
		});
		const report = await run();
		expect(codes(report)).toEqual(
			expect.arrayContaining([
				"invalid-memory-entry",
				"duplicate-memory-id",
				"cross-tier-memory-id",
				"invalid-memory-store",
				"invalid-memory-audit",
				"invalid-jsonl",
				"invalid-memory-metadata",
			]),
		);
		expect(JSON.stringify(report)).not.toContain("PRIVATE MEMORY");
	});
	it("reports oversized and unreadable files as skipped", async () => {
		const { adapter, run } = fixture();
		const stat = adapter.stat.getMockImplementation()!;
		adapter.stat.mockImplementation(async (p) =>
			p.endsWith("s.jsonl")
				? { type: "file", size: 9 * 1024 * 1024 }
				: stat(p),
		);
		adapter.read.mockRejectedValueOnce(new Error("PRIVATE ERROR"));
		const report = await run();
		expect(report.filesSkipped).toBe(2);
		expect(codes(report)).toEqual(
			expect.arrayContaining(["oversized-file", "unreadable"]),
		);
		expect(
			adapter.read.mock.calls.some(([p]) => p.endsWith("s.jsonl")),
		).toBe(false);
		expect(JSON.stringify(report)).not.toContain("PRIVATE ERROR");
	});
	it("validates draft attachment file references", async () => {
		const { run } = fixture({
			"sessions/index.json": {
				version: 1,
				sessions: [
					{
						id: "s",
						filePath: "sessions/s.jsonl",
						messageCount: 1,
						draftAttachmentsFile: "sessions/s.draft.json",
					},
				],
			},
			"sessions/s.draft.json": {},
		});
		expect(codes(await run())).toContain("invalid-draft");
	});
	it("bounds report detail while retaining total issue counts", async () => {
		const { run } = fixture({
			"sessions/s.jsonl": Array(510).fill("{bad").join("\n"),
		});
		const report = await run();
		expect(report.findings).toHaveLength(500);
		expect(report.omittedFindings).toBeGreaterThan(0);
		expect(report.counts.error).toBe(510);
	});
});
