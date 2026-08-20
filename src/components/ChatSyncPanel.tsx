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
	const logsEndRef = useRef<HTMLDivElement>(null);
	const startTimeRef = useRef<number>(0);

	useEffect(() => {
		logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [logs]);

	const updateLog = useCallback((entry: SyncLogEntry) => {
		setLogs((prev) => {
			const idx = prev.findIndex((l) => l.id === entry.id);
			if (idx >= 0) {
				const next = [...prev];
				next[idx] = { ...next[idx], ...entry };
				return next;
			}
			return [...prev.slice(-199), entry];
		});
	}, []);

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
				onProgress: (p: SyncProgress) => setProgress(p),
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
	}, [plugin, direction, dryRun, updateLog]);

	const handleCancel = useCallback(() => {
		(plugin as any).syncEngine?.cancel?.();
	}, [plugin]);

	const handleOpenSettings = useCallback(() => {
		// @ts-ignore
		plugin.app.setting.open();
		// @ts-ignore
		plugin.app.setting.openTabById("obsidian-ai");
	}, [plugin]);

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

	// ── Render ─────────────────────────────────────────────────────────────
	return (
		<div className="chat-sync-panel-v2">
			{/* ── Header Row ───────────────────────────────────────────── */}
			<div className="sync-v2-header">
				<h2>🔄 Chat Sync</h2>
				{isSyncing ? (
					<span className="sync-v2-status syncing">Syncing…</span>
				) : result ? (
					<span className={`sync-v2-status ${result.ok ? "success" : "error"}`}>
						{result.ok ? "Complete" : "Errors"}
					</span>
				) : error ? (
					<span className="sync-v2-status error">Failed</span>
				) : (
					<span className="sync-v2-status idle">Ready</span>
				)}
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
				<button className="sync-v2-settings-btn" onClick={handleOpenSettings}>
					⚙
				</button>
			</div>

			{/* ── Progress Section (syncit-style) ──────────────────────── */}
			{isSyncing && progress && (
				<div className="sync-v2-progress">
					<div className="sync-v2-progress-main">
						<div className="sync-v2-progress-bar-wrap">
							<div className="sync-v2-progress-track">
								<div
									className="sync-v2-progress-fill"
									style={{ width: `${progressPercent}%` }}
								/>
							</div>
						</div>
						<div className="sync-v2-progress-percent">{progressPercent}%</div>
					</div>
					<div className="sync-v2-progress-meta">
						<span>{progress.completed} / {progress.total} sessions</span>
						<span>⏱ {elapsedText}</span>
					</div>
				</div>
			)}

			{/* ── Category Counters (syncit-style pills) ───────────────── */}
			{(isSyncing || logs.length > 0) && (
				<div className="sync-v2-counters">
					<div className="sync-v2-pill">
						<span className="sync-v2-pill-label">Scanned</span>
						<span className="sync-v2-pill-count">{logs.length}</span>
					</div>
					<div className="sync-v2-pill upload">
						<span className="sync-v2-pill-label">Upload</span>
						<span className="sync-v2-pill-count">{counts.upload}</span>
					</div>
					<div className="sync-v2-pill download">
						<span className="sync-v2-pill-label">Download</span>
						<span className="sync-v2-pill-count">{counts.download}</span>
					</div>
					<div className="sync-v2-pill skip">
						<span className="sync-v2-pill-label">Skip</span>
						<span className="sync-v2-pill-count">{counts.skip}</span>
					</div>
					<div className="sync-v2-pill conflict">
						<span className="sync-v2-pill-label">Conflict</span>
						<span className="sync-v2-pill-count">{counts.conflict}</span>
					</div>
					<div className="sync-v2-pill error">
						<span className="sync-v2-pill-label">Error</span>
						<span className="sync-v2-pill-count">{counts.error}</span>
					</div>
				</div>
			)}

			{/* ── Result Summary ───────────────────────────────────────── */}
			{result && !isSyncing && (
				<div className={`sync-v2-result ${result.ok ? "success" : "error"}`}>
					<div className="sync-v2-result-text">
						{result.ok ? "✅" : "⚠️"} {result.message}
					</div>
					<div className="sync-v2-result-meta">
						<span>↑ {result.uploaded}</span>
						<span>↓ {result.downloaded}</span>
						<span>⚡ {result.conflicts}</span>
						<span>⊘ {result.skipped}</span>
						{result.errors.length > 0 && <span>⚠️ {result.errors.length}</span>}
						<span>⏱ {elapsedText}</span>
					</div>
				</div>
			)}

			{error && !isSyncing && (
				<div className="sync-v2-error">❌ {error}</div>
			)}

			{/* ── Per-item List (syncit-style cards) ───────────────────── */}
			<div className="sync-v2-list">
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
				{isSyncing ? (
					<button className="sync-v2-btn cancel" onClick={handleCancel}>
						🛑 Cancel Sync
					</button>
				) : (
					<button
						className="sync-v2-btn primary"
						onClick={handleSync}
						disabled={!rs.enabled || rs.backend === "none"}
					>
						🔄 {dryRun ? "Dry Run" : "Sync Now"}
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
		<div className={`sync-v2-item sync-v2-item--${entry.operation}`}>
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
