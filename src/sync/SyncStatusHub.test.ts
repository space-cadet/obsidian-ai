import { describe, it, expect } from "vitest";
import { SyncStatusHub, formatBytes, formatRate } from "./SyncStatusHub";

describe("SyncStatusHub (T42g)", () => {
	it("transitions disabled → syncing → idle across a successful run", () => {
		const hub = new SyncStatusHub();
		const states: string[] = [];
		hub.subscribe((s) => states.push(s.state));

		hub.setState("idle");
		hub.beginRun("manual");
		hub.publishProgress({
			phase: "syncing",
			stage: "Syncing",
			total: 2,
			completed: 1,
			uploaded: 1,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			elapsedMs: 100,
			indeterminate: false,
			uploadedBytes: 128,
			downloadedBytes: 0,
		});
		hub.endRun({
			ok: true,
			message: "done",
			uploaded: 1,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			uploadedBytes: 128,
			downloadedBytes: 0,
			errors: [],
			dryRun: false,
			trigger: "manual",
			startedAt: 0,
			finishedAt: 100,
			durationMs: 100,
		});

		// publishProgress re-emits while syncing (progress updates)
		expect(states[0]).toBe("disabled");
		expect(states[1]).toBe("idle");
		expect(states).toContain("syncing");
		expect(states[states.length - 1]).toBe("idle");
		const snap = hub.getSnapshot();
		expect(snap.lastResult?.ok).toBe(true);
		expect(snap.lastResult?.uploadedBytes).toBe(128);
		expect(snap.progress).toBeNull();
	});

	it("extracts structured failures from error log entries", () => {
		const hub = new SyncStatusHub();
		hub.beginRun("auto");
		hub.publishLog({
			id: "session:abc123",
			operation: "upload",
			title: "Black holes draft",
			status: "active",
			timestamp: 1,
		});
		hub.publishLog({
			id: "session:abc123",
			operation: "error",
			title: "Black holes draft",
			status: "error",
			message: "Network unreachable",
			timestamp: 2,
		});

		const snap = hub.getSnapshot();
		expect(snap.failures.length).toBe(1);
		expect(snap.failures[0]).toMatchObject({
			operation: "upload",
			title: "Black holes draft",
			sessionId: "abc123",
			phase: "transfer",
			message: "Network unreachable",
		});
		// runLog merges rows by id: the active row was updated in place
		expect(snap.runLog.length).toBe(1);
		expect(snap.runLog[0].status).toBe("error");
		expect(snap.runLog[0].message).toBe("Network unreachable");
	});

	it("failed run leaves hub in error state", () => {
		const hub = new SyncStatusHub();
		hub.beginRun("manual");
		hub.endRun({
			ok: false,
			message: "boom",
			uploaded: 0,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			uploadedBytes: 0,
			downloadedBytes: 0,
			errors: ["boom"],
			dryRun: false,
			trigger: "manual",
			startedAt: 0,
			finishedAt: 10,
			durationMs: 10,
		});
		expect(hub.getSnapshot().state).toBe("error");
	});

	it("unsubscribe stops notifications", () => {
		const hub = new SyncStatusHub();
		let calls = 0;
		const off = hub.subscribe(() => calls++);
		expect(calls).toBe(1); // immediate snapshot
		off();
		hub.setState("idle");
		expect(calls).toBe(1);
	});
});

describe("formatBytes / formatRate", () => {
	it("formats sizes", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(2048)).toBe("2.0 KB");
		expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
	});

	it("derives rate from elapsed time", () => {
		expect(formatRate(4096, 2000)).toBe("2.0 KB/s");
		expect(formatRate(0, 1000)).toBe("—");
	});
});
