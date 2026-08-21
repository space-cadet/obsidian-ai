import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";

export type SyncDirection = "both" | "upload" | "download";
export type SyncStatus = "pending" | "active" | "done" | "error" | "skipped";

export interface SyncLogEntry {
	id: string;
	operation: "upload" | "download" | "conflict" | "skip" | "error" | "system";
	title: string;
	status: SyncStatus;
	message?: string;
	timestamp: number;
}

export interface SyncProgress {
	total: number;
	completed: number;
	uploaded: number;
	downloaded: number;
	conflicts: number;
	skipped: number;
	elapsedMs: number;
}

interface ChatSyncPanelProps {
	plugin: ChatPluginLike;
}

// ── Utilities ────────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return `${sec}s`;
	const min = Math.floor(sec / 60);
	const rem = sec % 60;
	if (min < 60) return `${min}m ${rem}s`;
	const hr = Math.floor(min / 60);
	return `${hr}h ${min % 60}m`;
}

// ── Component ────────────────────────────────────────────────────────────
const ChatSyncPanel: React.FC<ChatSyncPanelProps> = ({ plugin }) => {
	const rs = plugin.settings.remoteStorage;

	const [direction, setDirection] = useState<SyncDirection>(rs.syncDirection ?? "both");
	const [dryRun, setDryRun] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [progress, setProgress] = useState<SyncProgress | null>(null);
	const [logs, setLogs] = useState<SyncLogEntry[]>([]);
	const [result, setResult] = useState<{
		ok: boolean;
		message: string;
		uploaded: number;
		downloaded: number;
		conflicts: number;
		skipped: number;
		errors: string[];
		elapsedMs: number;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [showRebuildChoices, setShowRebuildChoices] = useState(false);
	const [isRebuilding, setIsRebuilding] = useState(false);
	const [rebuildReport, setRebuildReport] = useState<{
		uploaded: number;
		downloaded: number;
		conflicts: number;
		skipped: number;
	} | null>(null);
	const logsEndRef = useRef<HTMLDivElement>(null);
	const startTimeRef = useRef<number>(0);

	// ── Batched update refs ────────────────────────────────────────────────
	const logBufferRef = useRef<SyncLogEntry[]>([]);
	const progressBufferRef = useRef<SyncProgress | null>(null);
	const rafRef = useRef<number | null>(null);

	const flushUpdates = useCallback(() => {
		rafRef.current = null;
		if (logBufferRef.current.length > 0) {
			const batch = logBufferRef.current;
			logBufferRef.current = [];
			setLogs((prev) => {
				const next = [...prev];
				const map = new Map(next.map((l, i) => [l.id + l.timestamp, i]));
				for (const entry of batch) {
					const key = entry.id + entry.timestamp;
					const idx = map.get(key);
					if (idx !== undefined) {
						next[idx] = { ...next[idx], ...entry };
					} else {
						next.push(entry);
						if (next.length > 200) next.shift();
					}
				}
				return next;
			});
		}
		if (progressBufferRef.current) {
			setProgress(progressBufferRef.current);
			progressBufferRef.current = null;
		}
	}, []);

	useEffect(() => {
		logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [logs]);

	const updateLog = useCallback((entry: SyncLogEntry) => {
		logBufferRef.current.push(entry);
		if (!rafRef.current) {
			rafRef.current = requestAnimationFrame(flushUpdates);
		}
	}, [flushUpdates]);

	const updateProgress = useCallback((p: SyncProgress) => {
		progressBufferRef.current = p;
		if (!rafRef.current) {
			rafRef.current = requestAnimationFrame(flushUpdates);
		}
	}, [flushUpdates]);

	const handleSync = useCallback(async () => {
		setIsSyncing(true);
		setProgress(null);
		setResult(null);
		setError(null);
		setLogs([]);
		startTimeRef.current = Date.now();

		try {
			const syncResult = await (plugin as any).triggerSync?.(dryRun, {
				direction,
				onProgress: (p: SyncProgress) => updateProgress(p),
				onLog: (entry: SyncLogEntry) => updateLog(entry),
			});

			if (syncResult) {
				const elapsedMs = Date.now() - startTimeRef.current;
				setResult({ ...syncResult, elapsedMs });
			}
		} catch (err: any) {
			const msg = err?.message || String(err);
			setError(msg);
			updateLog({
				id: "__error__",
				operation: "error",
				title: "Sync failed",
				status: "error",
				message: msg,
				timestamp: Date.now(),
			});
		} finally {
			setIsSyncing(false);
		}
	}, [plugin, direction, dryRun, updateLog, updateProgress]);

	const handleCancel = useCallback(() => {
		plugin.cancelSync?.();
	}, [plugin]);

	const handleOpenSettings = useCallback(() => {
		if (plugin.openRemoteStorageSettings) {
			plugin.openRemoteStorageSettings();
			return;
		}
		// Fallback for lightweight hosts and previews.
		// @ts-ignore
		plugin.app.setting.open();
		// @ts-ignore
		plugin.app.setting.openTabById(plugin.manifest.id);
	}, [plugin]);

	const handleRebuild = useCallback(async (choice: "remote" | "local" | "compare") => {
		if (!plugin.rebuildSyncIndex) return;
		setIsRebuilding(true);
		setShowRebuildChoices(false);
		setError(null);
		setRebuildReport(null);
		setLogs([]);
		try {
			const report = await plugin.rebuildSyncIndex(choice, {
				onLog: updateLog,
			});
			setRebuildReport(report);
		} catch (err: any) {
			setError(err?.message || String(err));
		} finally {
			setIsRebuilding(false);
		}
	}, [plugin]);

	const isBusy = isSyncing || isRebuilding;

	// ── Derived state ──────────────────────────────────────────────────────
	const lastSyncText = rs.lastSyncTime
		? new Date(rs.lastSyncTime).toLocaleString()
		: "Never";

	const progressPercent = useMemo(() => {
		if (!progress || progress.total <= 0) return 0;
		return Math.round((progress.completed / progress.total) * 100);
	}, [progress]);

	const elapsedText = useMemo(() => {
		if (progress) return formatDuration(progress.elapsedMs);
		if (result) return formatDuration(result.elapsedMs);
		return "0s";
	}, [progress, result]);

	const counts = useMemo(() => {
		return {
			upload: logs.filter((l) => l.operation === "upload").length,
			download: logs.filter((l) => l.operation === "download").length,
			skip: logs.filter((l) => l.operation === "skip").length,
			conflict: logs.filter((l) => l.operation === "conflict").length,
			error: logs.filter((l) => l.operation === "error").length,
			done: logs.filter((l) => l.status === "done").length,
		};
	}, [logs]);

	const scanned = progress?.total ?? logs.length;
	const completed = progress?.completed ?? counts.done;
	const statusHeading = isSyncing ? "Syncing…" : result ? (result.ok ? "Complete" : "Sync finished with errors") : error ? "Sync failed" : "Ready to sync";
	const directionLabel = direction === "both" ? "Upload + download" : direction === "upload" ? "Upload" : "Download";

	// ── Render ─────────────────────────────────────────────────────────────
	return (
		<div className="chat-sync-panel-v2">
			<div className="sync-v2-status-block">
				<div className="sync-v2-eyebrow">Status</div>
				<h2 className={isSyncing ? "sync-v2-status--syncing" : ""}>
					{isSyncing && <span className="sync-v2-spinner" />}
					{statusHeading}
				</h2>
				<div className="sync-v2-substatus">{isSyncing ? `${completed} of ${scanned} · ${elapsedText}` : `${directionLabel} · Last sync: ${lastSyncText}`}</div>
			</div>

			{/* ── Controls Row ─────────────────────────────────────────── */}
			<div className="sync-v2-controls">
				<select
					value={direction}
					onChange={(e) => setDirection(e.target.value as SyncDirection)}
					disabled={isSyncing}
				>
					<option value="both">Both directions</option>
					<option value="upload">Upload only</option>
					<option value="download">Download only</option>
				</select>
				<label className="sync-v2-dryrun">
					<input
						type="checkbox"
						checked={dryRun}
						onChange={(e) => setDryRun(e.target.checked)}
						disabled={isSyncing}
					/>
					Dry run
				</label>
				<button className="sync-v2-settings-btn" onClick={handleOpenSettings} aria-label="Open settings" title="Open settings">
					⚙️
				</button>
			</div>

			{showRebuildChoices && !isBusy && (
				<div className="sync-v2-rebuild-backdrop" role="presentation">
				<div className="sync-v2-rebuild-panel" role="dialog" aria-modal="true" aria-labelledby="sync-v2-rebuild-title">
					<h3 id="sync-v2-rebuild-title">Rebuild sync record</h3>
					<p>The app needs to decide which copies to trust.</p>
					<div className="sync-v2-rebuild-options">
						<button onClick={() => void handleRebuild("remote")} disabled={isRebuilding}>Trust remote copies</button>
						<button onClick={() => void handleRebuild("local")} disabled={isRebuilding}>Trust local copies</button>
						<button onClick={() => void handleRebuild("compare")} disabled={isRebuilding}>Compare copies</button>
						<button onClick={() => setShowRebuildChoices(false)} disabled={isRebuilding}>Cancel</button>
					</div>
				</div>
				</div>
			)}
			{rebuildReport && !showRebuildChoices && (
				<div className="sync-v2-rebuild-report">
					<strong>Rebuild finished</strong>
					<span>Uploaded: {rebuildReport.uploaded}</span>
					<span>Downloaded: {rebuildReport.downloaded}</span>
					<span>Needs attention: {rebuildReport.conflicts}</span>
					<span>Already matched: {rebuildReport.skipped}</span>
					<button onClick={() => setRebuildReport(null)}>Dismiss</button>
				</div>
			)}

			{/* ── Progress Section (SyncIt-style) ──────────────────────── */}
			{isSyncing && (
				<div className="sync-v2-progress">
					<div className="sync-v2-progress-track"><div className={`sync-v2-progress-fill ${isSyncing ? "sync-v2-progress-fill--active" : ""}`} style={{ width: `${progressPercent}%` }} /></div>
					<div className="sync-v2-progress-meta"><span>{progressPercent}%</span><span>{progress?.completed ?? 0} / {progress?.total ?? 0} sessions</span></div>
				</div>
			)}

			{/* ── Category Counters (syncit-style pills) ───────────────── */}
			{(isSyncing || logs.length > 0 || result) && (
				<div className="sync-v2-counters">
					<div className="sync-v2-pill"><span className="sync-v2-pill-count">{scanned}</span><span className="sync-v2-pill-label">scanned</span></div>
					<div className="sync-v2-pill upload">
						<span className="sync-v2-pill-count">{counts.upload}</span>
						<span className="sync-v2-pill-label">upload</span>
					</div>
					<div className="sync-v2-pill download">
						<span className="sync-v2-pill-count">{counts.download}</span>
						<span className="sync-v2-pill-label">download</span>
					</div>
					<div className="sync-v2-pill skip">
						<span className="sync-v2-pill-count">{counts.skip}</span>
						<span className="sync-v2-pill-label">skip</span>
					</div>
					<div className="sync-v2-pill conflict">
						<span className="sync-v2-pill-count">{counts.conflict}</span>
						<span className="sync-v2-pill-label">conflict</span>
					</div>
					<div className="sync-v2-pill error">
						<span className="sync-v2-pill-count">{counts.error}</span>
						<span className="sync-v2-pill-label">error</span>
					</div>
				</div>
			)}

			{error && !isSyncing && (
				<div className="sync-v2-error">❌ {error}</div>
			)}

			{/* ── Per-item List (syncit-style cards) ───────────────────── */}
			<div className="sync-v2-list">
				<div className="sync-v2-section-title">Files</div>
				{logs.length === 0 && !isSyncing && (
					<div className="sync-v2-empty">
						<div className="sync-v2-empty-icon">📂</div>
						<div>No sync activity yet</div>
						<div className="sync-v2-empty-sub">Last sync: {lastSyncText}</div>
					</div>
				)}
				{logs.map((log) => (
					<SyncItem key={log.id + log.timestamp} entry={log} />
				))}
				<div ref={logsEndRef} />
			</div>

			{/* ── Action Bar ───────────────────────────────────────────── */}
			<div className="sync-v2-actions">
				{isBusy ? (
					<button className="sync-v2-btn cancel" onClick={handleCancel}>
						Cancel
					</button>
				) : (
					<button
						className="sync-v2-btn primary"
						onClick={handleSync}
						disabled={!rs.enabled || rs.backend === "none"}
					>
						{dryRun ? "Start dry run" : "Start sync"}
					</button>
				)}
				{!isBusy && (
					<button className="sync-v2-btn rebuild" onClick={() => setShowRebuildChoices(true)} disabled={isRebuilding}>
						{isRebuilding ? "Rebuilding…" : "Rebuild"}
					</button>
				)}
			</div>
		</div>
	);
};

// ── Individual sync item card ────────────────────────────────────────────
const SyncItem: React.FC<{ entry: SyncLogEntry }> = ({ entry }) => {
	const opLabel = {
		upload: "Uploading",
		download: "Downloading",
		conflict: "Conflict",
		skip: "Skipped",
		error: "Error",
		system: "",
	}[entry.operation];

	const statusLabel = {
		pending: "Pending",
		active: "In Progress",
		done: "Done",
		error: "Failed",
		skipped: "Skipped",
	}[entry.status];

	return (
		<div className={`sync-v2-item sync-v2-item--${entry.operation} ${entry.status === "pending" ? "sync-v2-item--pending" : ""}`}>
			<div className="sync-v2-item-main">
				<div className="sync-v2-item-title" title={entry.title}>
					{entry.title}
				</div>
				{entry.message && (
					<div className="sync-v2-item-message">{entry.message}</div>
				)}
			</div>
			<div className="sync-v2-item-meta">
				{opLabel && <span className="sync-v2-item-action">{opLabel}</span>}
				<span className={`sync-v2-item-status sync-v2-item-status--${entry.status}`}>
					{statusLabel}
				</span>
			</div>
		</div>
	);
};

export default React.memo(ChatSyncPanel);
