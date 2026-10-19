import { describe, expect, it, vi } from "vitest";
import {
	previewDataRepair,
	scheduleDataRepair,
	type RepairAdapter,
} from "../dataRepair";

const root = ".obsidian/plugins/obsidian-ai";
const indexPath = `${root}/sessions/index.json`;

function makeAdapter(files: Map<string, string>): RepairAdapter {
	return {
		exists: vi.fn(async (path: string) => files.has(path)),
		read: vi.fn(async (path: string) => files.get(path) ?? ""),
		stat: vi.fn(async (path: string) => {
			const content = files.get(path);
			return content === undefined
				? null
				: {
						size: new TextEncoder().encode(content).byteLength,
						type: "file",
					};
		}),
		list: vi.fn(async (path: string) => {
			const prefix = `${path.replace(/\/$/, "")}/`;
			return {
				files: [...files.keys()].filter(
					(candidate) =>
						candidate.startsWith(prefix) &&
						!candidate.slice(prefix.length).includes("/"),
				),
				folders: [],
			};
		}),
		write: vi.fn(async (path: string, content: string) => {
			files.set(path, content);
		}),
		mkdir: vi.fn(async () => undefined),
		remove: vi.fn(async (path: string) => {
			files.delete(path);
		}),
	};
}

function duplicateTranscript(id: string): string {
	const message = JSON.stringify({
		id: `${id}-message`,
		role: "user",
		content: "Hello",
		timestamp: 1,
	});
	return `${message}\n${message}\n`;
}

function session(id: string) {
	return {
		id,
		title: id,
		createdAt: 1,
		updatedAt: 1,
		messageCount: 1,
		filePath: `sessions/${id}.jsonl`,
	};
}

describe("scheduleDataRepair", () => {
	it("rejects safe repairs discovered after the user previewed the plan", async () => {
		const files = new Map<string, string>([
			[
				indexPath,
				JSON.stringify({
					version: 1,
					activeSessionId: "chat-one",
					sessions: [session("chat-one")],
				}),
			],
			[`${root}/sessions/chat-one.jsonl`, duplicateTranscript("one")],
		]);
		const adapter = makeAdapter(files);
		const approvedPlan = await previewDataRepair(adapter, root);

		files.set(
			indexPath,
			JSON.stringify({
				version: 1,
				activeSessionId: "chat-one",
				sessions: [session("chat-one"), session("chat-two")],
			}),
		);
		files.set(
			`${root}/sessions/chat-two.jsonl`,
			duplicateTranscript("two"),
		);

		await expect(
			scheduleDataRepair(adapter, root, approvedPlan),
		).rejects.toThrow("Files changed since the preview. Preview again.");
		expect(files.has(`${root}/health-repair-request.json`)).toBe(false);
	});
});
