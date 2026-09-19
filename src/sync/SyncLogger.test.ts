import { describe, it, expect } from "vitest";
import { SyncLogger } from "./SyncLogger";

function makeLogger(opts?: {
	maxLines?: number;
	maxAgeMs?: number;
	maxBytes?: number;
}) {
	const files = new Map<string, string>();
	const vault = {
		configDir: ".obsidian",
		adapter: {
			exists: async (p: string) => files.has(p),
			read: async (p: string) => files.get(p) ?? "",
			write: async (p: string, c: string) => void files.set(p, c),
			copy: async (from: string, to: string) =>
				files.set(to, files.get(from) ?? ""),
		},
	};
	return {
		logger: new SyncLogger({ vault } as any, "obsidian-ai", opts),
		files,
	};
}

function line(ts: number, msg: string): string {
	return `${new Date(ts).toISOString()} [abcdef] upload -------- — ${msg}`;
}

describe("SyncLogger rotation (T42g)", () => {
	it("prunes lines older than maxAge", () => {
		const { logger } = makeLogger({ maxAgeMs: 1000 });
		const now = Date.now();
		const kept = logger.pruneLines([
			line(now - 10_000, "old"),
			line(now, "fresh"),
		]);
		expect(kept.length).toBe(1);
		expect(kept[0]).toContain("fresh");
	});

	it("caps at maxLines (newest kept)", () => {
		const { logger } = makeLogger({ maxLines: 3, maxAgeMs: 1e12 });
		const now = Date.now();
		const kept = logger.pruneLines(
			[1, 2, 3, 4, 5].map((i) => line(now + i, `m${i}`)),
		);
		expect(kept.length).toBe(3);
		expect(kept[kept.length - 1]).toContain("m5");
	});

	it("drops oldest lines to fit the byte budget", () => {
		const { logger } = makeLogger({
			maxLines: 100,
			maxAgeMs: 1e12,
			maxBytes: 200,
		});
		const now = Date.now();
		const lines = Array.from({ length: 20 }, (_, i) =>
			line(now + i, `x`.repeat(40)),
		);
		const kept = logger.pruneLines(lines);
		expect(kept.length).toBeLessThan(20);
		expect(kept.length).toBeGreaterThan(0);
		expect(kept.join("\n").length).toBeLessThanOrEqual(200);
	});

	it("rotates an oversized existing log to the backup slot", async () => {
		const { logger, files } = makeLogger({ maxBytes: 1000 });
		const now = Date.now();
		const big = Array.from({ length: 600 }, (_, i) =>
			line(now + i, `y`.repeat(100)),
		).join("\n");
		files.set(".obsidian/plugins/obsidian-ai/sync.log", big);

		logger.log({
			timestamp: now,
			deviceId: "abcdef123",
			action: "upload",
			message: "new entry",
		});
		await logger.flushLocal();

		const backup = files.get(".obsidian/plugins/obsidian-ai/sync.log.1");
		expect(backup).toBe(big);
		const current = files.get(".obsidian/plugins/obsidian-ai/sync.log")!;
		expect(current).toContain("new entry");
		expect(current.length).toBeLessThan(big.length);
	});

	it("readRecent returns the newest lines", async () => {
		const { logger, files } = makeLogger();
		const now = Date.now();
		files.set(
			".obsidian/plugins/obsidian-ai/sync.log",
			Array.from({ length: 10 }, (_, i) => line(now + i, `n${i}`)).join(
				"\n",
			),
		);
		const recent = await logger.readRecent(3);
		expect(recent.length).toBe(3);
		expect(recent[2]).toContain("n9");
	});
});
