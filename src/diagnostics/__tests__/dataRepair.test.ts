import { beforeAll, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import {
	previewDataRepair,
	scheduleDataRepair,
	applyPendingDataRepair,
	cancelDataRepair,
} from "../dataRepair";
beforeAll(() => {
	vi.stubGlobal("crypto", webcrypto);
	vi.stubGlobal("TextEncoder", TextEncoder);
});
const root = ".obsidian/plugins/chat-lab";
const transcript = `${root}/sessions/s.jsonl`;
const index = `${root}/sessions/index.json`;
const request = `${root}/health-repair-request.json`;
const running = `${root}/health-repair-running.json`;
const message = { id: "m", role: "user", content: "keep all content" };
const original =
	JSON.stringify(message) + "\n" + JSON.stringify(message) + "\n";
function fixture() {
	const files: Record<string, string> = {
		[transcript]: original,
		[index]: JSON.stringify({
			version: 1,
			sessions: [
				{ id: "s", filePath: "sessions/s.jsonl", messageCount: 2 },
			],
			activeSessionId: "gone",
			openSessionIds: ["s", "s", "gone"],
		}),
	};
	const folders = new Set<string>();
	const adapter = {
		exists: vi.fn(
			async (path: string) => path in files || folders.has(path),
		),
		read: vi.fn(async (path: string) => {
			if (!(path in files)) throw new Error("missing");
			return files[path];
		}),
		stat: vi.fn(async (path: string) =>
			path in files ? { type: "file", size: files[path].length } : null,
		),
		list: vi.fn(async () => ({ files: [], folders: [] })),
		write: vi.fn(async (path: string, data: string) => {
			files[path] = data;
		}),
		mkdir: vi.fn(async (path: string) => {
			folders.add(path);
		}),
		remove: vi.fn(async (path: string) => {
			delete files[path];
		}),
	};
	return { files, adapter };
}
describe("conservative startup repairs", () => {
	it("previews without mutation; scheduling only writes the approved request", async () => {
		const { adapter, files } = fixture();
		const plan = await previewDataRepair(adapter, root);
		expect(plan.changes.map((c) => c.path)).toEqual([transcript, index]);
		expect(adapter.write).not.toHaveBeenCalled();
		expect(JSON.stringify(plan)).not.toContain(message.content);
		await scheduleDataRepair(adapter, root, plan);
		expect(adapter.write.mock.calls.map(([p]) => p)).toEqual([request]);
		expect(files[transcript]).toBe(original);
	});
	it("backs up every original before writes, repairs counts/tabs, and runs only once", async () => {
		const { adapter, files } = fixture();
		const originalIndex = files[index];
		await scheduleDataRepair(
			adapter,
			root,
			await previewDataRepair(adapter, root),
		);
		adapter.write.mockClear();
		const result = await applyPendingDataRepair(adapter, root);
		expect(result?.status).toBe("repaired");
		expect(result?.filesChanged).toBe(2);
		expect(files[transcript]).toBe(JSON.stringify(message) + "\n");
		expect(JSON.parse(files[index])).toMatchObject({
			sessions: [{ messageCount: 1 }],
			activeSessionId: null,
			openSessionIds: ["s"],
		});
		expect(files[`${result!.backupDir}/0.original`]).toBe(original);
		expect(files[`${result!.backupDir}/1.original`]).toBe(originalIndex);
		const paths = adapter.write.mock.calls.map(([p]) => p);
		expect(paths.indexOf(transcript)).toBeGreaterThan(
			paths.indexOf(`${result!.backupDir}/1.original`),
		);
		expect(files[request]).toBeUndefined();
		expect(files[running]).toBeUndefined();
		expect(await applyPendingDataRepair(adapter, root)).toBeNull();
		expect((await previewDataRepair(adapter, root)).changes).toHaveLength(
			0,
		);
	});
	it("rejects a stale preview before scheduling", async () => {
		const { adapter, files } = fixture();
		const plan = await previewDataRepair(adapter, root);
		files[transcript] += "\n";
		await expect(scheduleDataRepair(adapter, root, plan)).rejects.toThrow(
			"Files changed",
		);
		expect(files[request]).toBeUndefined();
	});
	it("cancels a stale scheduled request without altering data", async () => {
		const { adapter, files } = fixture();
		await scheduleDataRepair(
			adapter,
			root,
			await previewDataRepair(adapter, root),
		);
		files[transcript] += "\n";
		const current = files[transcript];
		const result = await applyPendingDataRepair(adapter, root);
		expect(result?.status).toBe("cancelled");
		expect(files[transcript]).toBe(current);
		expect(files[request]).toBeUndefined();
	});
	it("does not touch sources when a backup fails", async () => {
		const { adapter, files } = fixture();
		const savedIndex = files[index];
		await scheduleDataRepair(
			adapter,
			root,
			await previewDataRepair(adapter, root),
		);
		const write = adapter.write.getMockImplementation()!;
		adapter.write.mockImplementation(async (p, d) => {
			if (p.endsWith("1.original")) throw new Error("full disk");
			return write(p, d);
		});
		expect((await applyPendingDataRepair(adapter, root))?.status).toBe(
			"failed",
		);
		expect(files[transcript]).toBe(original);
		expect(files[index]).toBe(savedIndex);
	});
	it("rolls back an earlier write when the next source write fails", async () => {
		const { adapter, files } = fixture();
		const savedIndex = files[index];
		await scheduleDataRepair(
			adapter,
			root,
			await previewDataRepair(adapter, root),
		);
		const write = adapter.write.getMockImplementation()!;
		adapter.write.mockImplementation(async (p, d) => {
			if (p === index) throw new Error("write failed");
			return write(p, d);
		});
		expect((await applyPendingDataRepair(adapter, root))?.status).toBe(
			"failed",
		);
		expect(files[transcript]).toBe(original);
		expect(files[index]).toBe(savedIndex);
		expect(files[running]).toBeUndefined();
	});
	it("keeps a recovery marker after a partial failed write and never blindly retries", async () => {
		const { adapter, files } = fixture();
		await scheduleDataRepair(
			adapter,
			root,
			await previewDataRepair(adapter, root),
		);
		const write = adapter.write.getMockImplementation()!;
		adapter.write.mockImplementation(async (p, d) => {
			if (p === transcript) {
				files[p] = "partial";
				throw new Error("partial failure");
			}
			return write(p, d);
		});
		const result = await applyPendingDataRepair(adapter, root);
		expect(result?.status).toBe("interrupted");
		expect(files[running]).toBeDefined();
		expect(files[`${result!.backupDir}/0.original`]).toBe(original);
		adapter.write.mockClear();
		expect((await applyPendingDataRepair(adapter, root))?.status).toBe(
			"interrupted",
		);
		expect(adapter.write).not.toHaveBeenCalled();
	});
	it("leaves conflicting, malformed, empty/incomplete and oversized transcripts unchanged", async () => {
		for (const text of [
			JSON.stringify(message) +
				"\n" +
				JSON.stringify({ ...message, content: "different" }),
			"{invalid",
			"",
			JSON.stringify(message),
		]) {
			const { adapter, files } = fixture();
			files[transcript] = text;
			const plan = await previewDataRepair(adapter, root);
			expect(plan.changes.some((c) => c.path === transcript)).toBe(false);
			expect(plan.skipped.some((s) => s.path === transcript)).toBe(true);
			expect(adapter.write).not.toHaveBeenCalled();
		}
		const { adapter } = fixture();
		const stat = adapter.stat.getMockImplementation()!;
		adapter.stat.mockImplementation((p) =>
			p === transcript
				? Promise.resolve({ type: "file", size: 9 * 1024 * 1024 })
				: stat(p),
		);
		const plan = await previewDataRepair(adapter, root);
		expect(plan.changes.some((c) => c.path === transcript)).toBe(false);
		expect(adapter.read.mock.calls.some(([p]) => p === transcript)).toBe(
			false,
		);
	});
	it("does not recover unindexed files or follow unsafe index paths", async () => {
		const { adapter, files } = fixture();
		files[index] = JSON.stringify({
			version: 1,
			sessions: [
				{ id: "s", filePath: "../private.json", messageCount: 2 },
			],
		});
		files[`${root}/sessions/orphan.jsonl`] = original;
		const plan = await previewDataRepair(adapter, root);
		expect(plan.changes).toHaveLength(0);
		expect(adapter.read.mock.calls).toEqual([[index]]);
	});
	it("deduplicates only identical valid memory entries, without crossing tiers", async () => {
		const { adapter, files } = fixture();
		const m = {
			id: "m",
			timestamp: "2026-10-19",
			content: "private memory",
			tags: [],
			category: "user_fact",
		};
		const path = `${root}/intelligence/memory.json`;
		files[path] = JSON.stringify([m, m]);
		expect(
			(await previewDataRepair(adapter, root)).changes.some(
				(c) => c.path === path,
			),
		).toBe(true);
		files[path] = JSON.stringify([m, { ...m, content: "different" }]);
		expect(
			(await previewDataRepair(adapter, root)).changes.some(
				(c) => c.path === path,
			),
		).toBe(false);
		files[path] = JSON.stringify([
			{ id: "m", content: "malformed" },
			{ id: "m", content: "malformed" },
		]);
		expect(
			(await previewDataRepair(adapter, root)).changes.some(
				(c) => c.path === path,
			),
		).toBe(false);
	});
	it("cancels queued repairs without touching data", async () => {
		const { adapter, files } = fixture();
		await scheduleDataRepair(
			adapter,
			root,
			await previewDataRepair(adapter, root),
		);
		await cancelDataRepair(adapter, root);
		await cancelDataRepair(adapter, root);
		expect(files[request]).toBeUndefined();
		expect(files[transcript]).toBe(original);
		expect(await applyPendingDataRepair(adapter, root)).toBeNull();
	});
	it("does not overwrite external changes that arrive after backups", async () => {
		const { adapter, files } = fixture();
		await scheduleDataRepair(
			adapter,
			root,
			await previewDataRepair(adapter, root),
		);
		const write = adapter.write.getMockImplementation()!;
		adapter.write.mockImplementation(async (p, d) => {
			await write(p, d);
			if (p === running) files[transcript] = "external update";
		});
		expect((await applyPendingDataRepair(adapter, root))?.status).toBe(
			"failed",
		);
		expect(files[transcript]).toBe("external update");
	});
	it("rejects a backup whose stored bytes fail verification", async () => {
		const { adapter, files } = fixture();
		await scheduleDataRepair(
			adapter,
			root,
			await previewDataRepair(adapter, root),
		);
		const write = adapter.write.getMockImplementation()!;
		adapter.write.mockImplementation(async (p, d) =>
			write(p, p.endsWith("0.original") ? "truncated backup" : d),
		);
		expect((await applyPendingDataRepair(adapter, root))?.status).toBe(
			"failed",
		);
		expect(files[transcript]).toBe(original);
	});
	it("does not follow paths injected into a saved request", async () => {
		const { adapter, files } = fixture();
		const plan = await previewDataRepair(adapter, root);
		plan.changes[0].path = "../private.json";
		files[request] = JSON.stringify(plan);
		expect((await applyPendingDataRepair(adapter, root))?.status).toBe(
			"cancelled",
		);
		expect(
			adapter.read.mock.calls.some(([p]) => p === "../private.json"),
		).toBe(false);
		expect(files[transcript]).toBe(original);
	});
});
