// src/sync/SyncStatusBar.ts
// T42g: app-level status bar indicator for sync. Idle / syncing / failed
// states; click activates the Chat Lab view so the full panel is one tap away.
import type ObsidianAIPlugin from "../main";
import { formatBytes, formatRate } from "./SyncStatusHub";
import type { SyncStatusSnapshot } from "./SyncStatusHub";

function relativeTime(ts: number): string {
	const secs = Math.max(1, Math.floor((Date.now() - ts) / 1000));
	if (secs < 60) return `${secs}s ago`;
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.floor(hrs / 24)}d ago`;
}

export function renderSyncStatusBar(
	item: HTMLElement,
	snap: SyncStatusSnapshot,
): void {
	item.removeClass(
		"obsidian-ai-sync-status--syncing",
		"obsidian-ai-sync-status--error",
	);

	if (snap.state === "disabled") {
		item.setText("");
		item.hide();
		return;
	}
	item.show();

	if (snap.state === "connecting") {
		item.setText("⇅ sync connecting…");
		return;
	}

	if (snap.state === "syncing" && snap.progress) {
		item.addClass("obsidian-ai-sync-status--syncing");
		const p = snap.progress;
		const bytes = (p.uploadedBytes ?? 0) + (p.downloadedBytes ?? 0);
		const rate = formatRate(bytes, p.elapsedMs);
		const parts: string[] = [];
		if (p.uploaded) parts.push(`↑${p.uploaded}`);
		if (p.downloaded) parts.push(`↓${p.downloaded}`);
		const counts = parts.length > 0 ? parts.join(" ") : "syncing";
		item.setText(`⇅ ${counts} · ${rate}`);
		return;
	}

	if (snap.state === "error" && snap.lastResult && !snap.lastResult.ok) {
		item.addClass("obsidian-ai-sync-status--error");
		item.setText("⚠ sync failed — tap to retry");
		return;
	}

	// idle
	const last =
		snap.lastResult?.finishedAt ??
		// settings.remoteStorage.lastSyncTime is filled by the caller when present
		(item.dataset.lastSyncTime
			? Number(item.dataset.lastSyncTime)
			: undefined);
	if (last) {
		const bytes =
			(snap.lastResult?.uploadedBytes ?? 0) +
			(snap.lastResult?.downloadedBytes ?? 0);
		const suffix = bytes > 0 ? ` · ${formatBytes(bytes)}` : "";
		item.setText(`⇅ last sync ${relativeTime(last)}${suffix}`);
	} else {
		item.setText("⇅ sync idle");
	}
}

export function mountSyncStatusBar(
	plugin: ObsidianAIPlugin,
	activateView: () => void,
): void {
	const item = plugin.addStatusBarItem();
	item.addClass("obsidian-ai-sync-status");
	item.setText("");

	// Mirror settings.lastSyncTime into the idle rendering path.
	const syncLastSync = () => {
		const ts = plugin.settings.remoteStorage?.lastSyncTime;
		if (ts) item.dataset.lastSyncTime = String(ts);
	};

	const enabled = () =>
		plugin.settings.remoteStorage?.enabled &&
		plugin.settings.remoteStorage?.backend !== "none";

	const unsubscribe = plugin.syncHub.subscribe((snap) => {
		if (!enabled()) {
			renderSyncStatusBar(item, {
				...snap,
				state: "disabled",
			});
			return;
		}
		if (snap.lastResult?.finishedAt) syncLastSync();
		renderSyncStatusBar(item, snap);
	});

	// Click opens the Chat Lab view so the user lands on the full panel.
	item.addEventListener("click", () => activateView());

	plugin.register(unsubscribe);
	syncLastSync();
}
