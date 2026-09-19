import { render, screen, act } from "@testing-library/react";
import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import ChatSyncPanel from "../ChatSyncPanel";
import { SyncStatusHub } from "../../sync/SyncStatusHub";
import type { ChatPluginLike } from "../../views/ObsidianAIChatView";

function makePlugin(overrides?: {
	configured?: boolean;
	hub?: SyncStatusHub | null;
}): ChatPluginLike {
	const configured = overrides?.configured ?? true;
	return {
		app: { vault: { configDir: ".obsidian" } },
		manifest: { id: "obsidian-ai" },
		settings: {
			remoteStorage: {
				enabled: configured,
				backend: configured ? "webdav" : "none",
				syncDirection: "both",
			},
		},
		syncHub: overrides?.hub === undefined ? null : overrides.hub,
		triggerSync: async () => ({ ok: true, message: "done" }),
		cancelSync: () => {},
		openRemoteStorageSettings: () => {},
	} as any;
}

function seedIdleResult(hub: SyncStatusHub) {
	hub.setState("idle");
	hub.beginRun("manual");
	hub.publishLog({
		id: "session:a1",
		operation: "upload",
		title: "Black holes draft",
		status: "done",
		timestamp: Date.now(),
	});
	hub.publishLog({
		id: "session:b2",
		operation: "download",
		title: "Research index",
		status: "done",
		timestamp: Date.now(),
	});
	hub.endRun({
		ok: true,
		message: "↑1 ↓1",
		uploaded: 1,
		downloaded: 1,
		conflicts: 0,
		skipped: 0,
		uploadedBytes: 2048,
		downloadedBytes: 1024,
		errors: [],
		dryRun: false,
		trigger: "manual",
		startedAt: Date.now() - 1000,
		finishedAt: Date.now(),
		durationMs: 1000,
	});
}

describe("ChatSyncPanel (T42g)", () => {
	beforeEach(() => {
		// jsdom lacks these; SyncStatusBar-style relative math doesn't run
		// here, but keep them defined for safety.
		(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	});

	it("shows the off state when sync is not configured", () => {
		render(<ChatSyncPanel plugin={makePlugin({ configured: false })} />);
		expect(screen.getByText("Sync is off")).toBeTruthy();
		expect(screen.getByText("Set up sync")).toBeTruthy();
	});

	it("shows idle state with last-sync summary and controls", () => {
		const hub = new SyncStatusHub();
		seedIdleResult(hub);
		render(<ChatSyncPanel plugin={makePlugin({ hub })} />);
		expect(screen.getAllByText(/Last sync/).length).toBeGreaterThan(0);
		expect(screen.getByText("Sync now")).toBeTruthy();
		expect(screen.getByText(/Dry run/)).toBeTruthy();
		expect(screen.getAllByText(/↑1 ↓1/)).toBeTruthy();
	});

	it("renders complete surface: stats + op log with chips", () => {
		const hub = new SyncStatusHub();
		seedIdleResult(hub);
		render(<ChatSyncPanel plugin={makePlugin({ hub })} />);
		expect(screen.getAllByText("done")).toBeTruthy(); // stat label
		expect(screen.getByText("Black holes draft")).toBeTruthy();
		expect(screen.getByText("Research index")).toBeTruthy();
		// per-row status chips
		const chips = document.querySelectorAll(".sync-chip--done");
		expect(chips.length).toBe(2);
	});

	it("shows syncing state from hub progress", () => {
		const hub = new SyncStatusHub();
		hub.setState("idle");
		hub.beginRun("auto");
		hub.publishProgress({
			phase: "syncing",
			stage: "Syncing chat sessions",
			total: 4,
			completed: 2,
			uploaded: 2,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			elapsedMs: 500,
			indeterminate: false,
			uploadedBytes: 4096,
			downloadedBytes: 0,
		});
		hub.publishLog({
			id: "session:c3",
			operation: "upload",
			title: "Loop quantum gravity notes",
			status: "active",
			timestamp: Date.now(),
		});
		render(<ChatSyncPanel plugin={makePlugin({ hub })} />);
		expect(screen.getAllByText("Syncing chat sessions")).toBeTruthy();
		expect(screen.getByText("2/4")).toBeTruthy();
		expect(screen.getByText("Loop quantum gravity notes")).toBeTruthy();
		expect(document.querySelector(".sync-progress-fill")).toBeTruthy();
		// summary tab shows live counts
		expect(screen.getByText("Cancel")).toBeTruthy();
	});

	it("reflects hub failure state with retry affordance", () => {
		const hub = new SyncStatusHub();
		hub.setState("idle");
		hub.beginRun("manual");
		hub.publishLog({
			id: "session:d4",
			operation: "error",
			title: "QHE correspondence",
			status: "error",
			message: "Network unreachable",
			timestamp: Date.now(),
		});
		hub.endRun({
			ok: false,
			message: "Sync failed: Network unreachable",
			uploaded: 0,
			downloaded: 0,
			conflicts: 0,
			skipped: 0,
			uploadedBytes: 0,
			downloadedBytes: 0,
			errors: ["Network unreachable"],
			dryRun: false,
			trigger: "manual",
			startedAt: Date.now() - 200,
			finishedAt: Date.now(),
			durationMs: 200,
		});
		render(<ChatSyncPanel plugin={makePlugin({ hub })} />);
		expect(screen.getByText("Failed operations")).toBeTruthy();
		expect(screen.getAllByText("Network unreachable")).toBeTruthy();
		expect(screen.getByText("Retry sync")).toBeTruthy();
	});

	it("updates when the hub publishes new state", () => {
		const hub = new SyncStatusHub();
		hub.setState("idle");
		const { rerender } = render(
			<ChatSyncPanel plugin={makePlugin({ hub })} />,
		);
		expect(screen.getByText("Sync idle")).toBeTruthy();
		act(() => {
			hub.beginRun("auto");
			hub.publishProgress({
				phase: "planning",
				stage: "Building sync plan",
				total: 0,
				completed: 0,
				uploaded: 0,
				downloaded: 0,
				conflicts: 0,
				skipped: 0,
				elapsedMs: 10,
				indeterminate: true,
			});
		});
		rerender(<ChatSyncPanel plugin={makePlugin({ hub })} />);
		expect(screen.getAllByText("Building sync plan")).toBeTruthy();
	});
});
