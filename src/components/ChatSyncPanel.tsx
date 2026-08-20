import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";

export type SyncDirection = "both" | "upload" | "download";

export type SyncStatus = "pending" | "active" | "done" | "error" | "skipped";

export interface SyncLogEntry {
	id: string;
	operation: "upload" | "download" | "conflict" | "skip" | "error" | "system";
	/** Human-readable session title */
	title: string;
	/** Status badge for this entry */
	status: SyncStatus;
	/** Optional detail message */
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

// ── Icon map ─────────────────────────────────────────────────────────────
const OP_ICON: Record<string, string> = {
	upload: "↑",
	download: "↓",
	conflict: "⚡",
	skip: "⊘",
	error: "✗",
	system: "•",
};

const OP_LABEL: Record<string, string> = {
	upload: "Upload",
	download: "Download",
	conflict: "Conflict",
	skip: "Skip",
	error: "Error",
	system: "",
};

const STATUS_BADGE: Record<SyncStatus, { text: string; cls: string }> = {
	pending: { text: "Pending", cls: "sync-badge-pending" },
	active:  { text: "Active",  cls: "sync-badge-active" },
	done:    { text: "Done",    cls: "sync-badge-done" },
	error:   { text: "Error",   cls: "sync-badge-error" },
	skipped: { text: "Skipped", cls: "sync-badge-skipped" },
};

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

	const [direction, setDirection] = useState<SyncDirection>(
		rs.syncDirection ?? "both",
	);
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

	// Auto-scroll logs to bottom
	useEffect(() => {
		logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [logs]);

	const addOrUpdateLog = useCallback((entry: SyncLogEntry) => {
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

		addOrUpdateLog({
			id: "__start__",
			operation: "system",
			title: dryRun ? "Dry run starting…" : "Sync starting…",
			status: "active",
			timestamp: Date.now(),
		});

		try {
			const syncResult = await (plugin as any).triggerSync?.(dryRun, {
				direction,
				onProgress: (p: SyncProgress) => setProgress(p),
				onLog: (entry: SyncLogEntry) => addOrUpdateLog(entry),
			});

			if (syncResult) {
				const elapsedMs = Date.now() - startTimeRef.current;
				setResult({
					...syncResult,
					elapsedMs,
				});
				addOrUpdateLog({
					id: "__done__",
					operation: "system",
					title: `${dryRun ? "Dry run" : "Sync"} complete`,
					status: syncResult.ok ? "done" : "error",
					message: syncResult.message,
					timestamp: Date.now(),
				});
			}
		} catch (err: any) {
			const msg = err?.message || String(err);
			setError(msg);
			addOrUpdateLog({
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
	}, [plugin, direction, dryRun, addOrUpdateLog]);

	const handleCancel = useCallback(() => {
		(plugin as any).syncEngine?.cancel?.();
		addOrUpdateLog({
			id: "__cancel__",
			operation: "system",
			title: "Cancelling…",
			status: "active",
			timestamp: Date.now(),
		});
	}, [plugin, addOrUpdateLog]);

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

	const pendingCount = useMemo(
		() => logs.filter((l) => l.status === "pending" || l.status === "active").length,
		[logs],
	);
	const doneCount = useMemo(
		() => logs.filter((l) => l.status === "done").length,
		[logs],
	);
	const errorCount = useMemo(
		() => logs.filter((l) => l.status === "error").length,
		[logs],
	);

	// ── Render ─────────────────────────────────────────────────────────────
	return (
		<div className="chat-sync-panel">
			{/* Header */}
			<div className="chat-sync-header">
				<h3>🔄 Chat Sync</h3>
				<div className="chat-sync-status">
					{isSyncing ? (
						<span className="chat-sync-status-syncing">Syncing…</span>
					) : result ? (
						<span className={result.ok ? "chat-sync-status-success" : "chat-sync-status-error"}>
							{result.ok ? "✅ Complete" : "⚠️ Errors"}
						</span>
					) : error ? (
						<span className="chat-sync-status-error">❌ Failed</span>
					) : (
						<span className="chat-sync-status-idle">Ready</span>
					)}
				</div>
			</div>

			{/* Controls */}
			<div className="chat-sync-controls">
				<div className="chat-sync-control-row">
					<label className="chat-sync-label">Direction</label>
					<select
						className="chat-sync-select"
						value={direction}
						onChange={(e) => setDirection(e.target.value as SyncDirection)}
						disabled={isSyncing}
					>
						<option value="both">Both directions</option>
						<option value="upload">Upload only</option>
						<option value="download">Download only</option>
					</select>
				</div>
				<div className="chat-sync-control-row">
					<label className="chat-sync-label">
						<input
							type="checkbox"
							checked={dryRun}
							onChange={(e) => setDryRun(e.target.checked)}
							disabled={isSyncing}
						/>
						Dry run
					</label>
					<button
						className="chat-btn-small"
						onClick={handleOpenSettings}
						title="Open sync settings"
					>
						⚙ Settings
					</button>
				</div>
			</div>

			{/* Meta */}
			<div className="chat-sync-meta">
				<span>Last sync: {lastSyncText}</span>
				{rs.backend !== "none" && rs.enabled && (
					<span className="chat-sync-backend">{rs.backend.toUpperCase()}</span>
				)}
			</div>

			{/* Progress Bar (always visible during sync) */}
			{isSyncing && progress && (
				<div className="chat-sync-progress">
					<div className="chat-sync-progress-top">
						<span className="chat-sync-progress-percent">{progressPercent}%</span>
						<span className="chat-sync-progress-elapsed">⏱ {elapsedText}</span>
					</div>
					<div className="chat-sync-progress-bar">
						<div
							className="chat-sync-progress-fill"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
					<div className="chat-sync-progress-stats">
						<span className="sync-stat">
							<span className="sync-stat-num">{progress.completed}</span>
							<span className="sync-stat-label">/ {progress.total}</span>
						</span>
						<span className="sync-stat sync-stat-up">
							<span className="sync-stat-icon">↑</span>
							<span className="sync-stat-num">{progress.uploaded}</span>
						</span>
						<span className="sync-stat sync-stat-down">
							<span className="sync-stat-icon">↓</span>
							<span className="sync-stat-num">{progress.downloaded}</span>
						</span>
						<span className="sync-stat sync-stat-conflict">
							<span className="sync-stat-icon">⚡</span>
							<span className="sync-stat-num">{progress.conflicts}</span>
						</span>
						<span className="sync-stat sync-stat-skip">
							<span className="sync-stat-icon">⊘</span>
							<span className="sync-stat-num">{progress.skipped}</span>
						</span>
					</div>
				</div>
			)}

			{/* Result summary */}
			{result && !isSyncing && (
				<div className={`chat-sync-result ${result.ok ? "is-success" : "is-error"}`}>
					<div className="chat-sync-result-message">
						{result.ok ? "✅" : "⚠️"} {result.message}
					</div>
					<div className="chat-sync-result-stats">
						<span className="sync-stat sync-stat-up">
							<span className="sync-stat-icon">↑</span>
							<span className="sync-stat-num">{result.uploaded}</span>
						</span>
						<span className="sync-stat sync-stat-down">
							<span className="sync-stat-icon">↓</span>
							<span className="sync-stat-num">{result.downloaded}</span>
						</span>
						<span className="sync-stat sync-stat-conflict">
							<span className="sync-stat-icon">⚡</span>
							<span className="sync-stat-num">{result.conflicts}</span>
						</span>
						<span className="sync-stat sync-stat-skip">
							<span className="sync-stat-icon">⊘</span>
							<span className="sync-stat-num">{result.skipped}</span>
						</span>
						{result.errors.length > 0 && (
							<span className="sync-stat sync-stat-error">
								<span className="sync-stat-icon">⚠️</span>
								<span className="sync-stat-num">{result.errors.length}</span>
							</span>
						)}
						<span className="sync-stat">
							<span className="sync-stat-icon">⏱</span>
							<span className="sync-stat-num">{elapsedText}</span>
						</span>
					</div>
				</div>
			)}

			{/* Error banner */}
			{error && !isSyncing && (
				<div className="chat-sync-error">❌ {error}</div>
			)}

			{/* Log list — rich items */}
			<div className="chat-sync-logs">
				{logs.length === 0 && !isSyncing && (
					<div className="chat-sync-empty">No sync activity yet</div>
				)}
				{logs.map((log) => {
					const badge = STATUS_BADGE[log.status];
					return (
						<div
							key={log.id}
							className={`chat-sync-item chat-sync-item--${log.operation} chat-sync-item--${log.status}`}
						>
							<div className="chat-sync-item-icon">
								{OP_ICON[log.operation] || "•"}
							</div>
							<div className="chat-sync-item-body">
								<div className="chat-sync-item-title-row">
									<span className="chat-sync-item-title" title={log.title}>
										{log.title}
									</span>
									<span className={`sync-badge ${badge.cls}`}>{badge.text}</span>
								</div>
								{log.message && (
									<div className="chat-sync-item-message">{log.message}</div>
								)}
							</div>
							<div className="chat-sync-item-op">
								{OP_LABEL[log.operation]}
							</div>
						</div>
					);
				})}
				<div ref={logsEndRef} />
			</div>

			{/* Action bar */}
			<div className="chat-sync-actions">
				{isSyncing ? (
					<button className="chat-btn chat-stop-btn" onClick={handleCancel}>
						🛑 Cancel
					</button>
				) : (
					<button
						className="chat-btn chat-send-btn"
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

export default React.memo(ChatSyncPanel);
