import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";

export type SyncDirection = "both" | "upload" | "download";

export interface SyncLogEntry {
	id: string;
	operation: "upload" | "download" | "conflict" | "skip" | "error" | "system";
	message: string;
	done?: boolean;
	error?: boolean;
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

const OP_ICONS: Record<string, string> = {
	upload: "↑",
	download: "↓",
	conflict: "⚡",
	skip: "⊘",
	error: "✗",
	system: "•",
};

const OP_COLORS: Record<string, string> = {
	upload: "var(--text-success)",
	download: "var(--text-accent)",
	conflict: "var(--text-warning)",
	skip: "var(--text-muted)",
	error: "var(--text-error)",
	system: "var(--text-muted)",
};

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

	const addLog = useCallback((entry: SyncLogEntry) => {
		setLogs((prev) => [...prev.slice(-99), entry]);
	}, []);

	const handleSync = useCallback(async () => {
		setIsSyncing(true);
		setProgress(null);
		setResult(null);
		setError(null);
		setLogs([]);
		startTimeRef.current = Date.now();

		addLog({
			id: "start",
			operation: "system",
			message: dryRun ? "Starting dry run..." : "Starting sync...",
			timestamp: Date.now(),
		});

		try {
			const syncResult = await (plugin as any).triggerSync?.(dryRun, {
				direction,
				onProgress: (p: SyncProgress) => setProgress(p),
				onLog: (entry: SyncLogEntry) => addLog(entry),
			});

			if (syncResult) {
				const elapsedMs = Date.now() - startTimeRef.current;
				setResult({
					...syncResult,
					elapsedMs,
				});
				addLog({
					id: "done",
					operation: "system",
					message: `${dryRun ? "Dry run" : "Sync"} complete: ${syncResult.message}`,
					timestamp: Date.now(),
				});
			}
		} catch (err: any) {
			const msg = err?.message || String(err);
			setError(msg);
			addLog({
				id: "error",
				operation: "error",
				message: `Failed: ${msg}`,
				error: true,
				timestamp: Date.now(),
			});
		} finally {
			setIsSyncing(false);
		}
	}, [plugin, direction, dryRun, addLog]);

	const handleCancel = useCallback(() => {
		(plugin as any).syncEngine?.cancel?.();
		addLog({
			id: "cancel",
			operation: "system",
			message: "Cancelling...",
			timestamp: Date.now(),
		});
	}, [plugin, addLog]);

	const handleOpenSettings = useCallback(() => {
		// @ts-ignore
		plugin.app.setting.open();
		// @ts-ignore
		plugin.app.setting.openTabById("obsidian-ai");
	}, [plugin]);

	const lastSyncText = rs.lastSyncTime
		? new Date(rs.lastSyncTime).toLocaleString()
		: "Never";

	const progressPercent =
		progress && progress.total > 0
			? Math.round((progress.completed / progress.total) * 100)
			: 0;

	return (
		<div className="chat-sync-panel">
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
						Dry run (no changes)
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

			<div className="chat-sync-meta">
				<span>Last sync: {lastSyncText}</span>
				{rs.backend !== "none" && rs.enabled && (
					<span className="chat-sync-backend">{rs.backend.toUpperCase()}</span>
				)}
			</div>

			{isSyncing && progress && (
				<div className="chat-sync-progress">
					<div className="chat-sync-progress-bar">
						<div className="chat-sync-progress-fill" style={{ width: `${progressPercent}%` }} />
					</div>
					<div className="chat-sync-progress-stats">
						<span>{progress.completed}/{progress.total} ({progressPercent}%)</span>
						<span>↑{progress.uploaded} ↓{progress.downloaded} ⚡{progress.conflicts} ⊘{progress.skipped}</span>
						<span>⏱️ {((progress.elapsedMs || 0) / 1000).toFixed(1)}s</span>
					</div>
				</div>
			)}

			{result && !isSyncing && (
				<div className={`chat-sync-result ${result.ok ? "is-success" : "is-error"}`}>
					<div className="chat-sync-result-message">
						{result.ok ? "✅" : "⚠️"} {result.message}
					</div>
					<div className="chat-sync-result-stats">
						<span>↑{result.uploaded}</span>
						<span>↓{result.downloaded}</span>
						<span>⚡{result.conflicts}</span>
						<span>⊘{result.skipped}</span>
						{result.errors.length > 0 && <span>⚠️ {result.errors.length}</span>}
						<span>⏱️ {(result.elapsedMs / 1000).toFixed(1)}s</span>
					</div>
				</div>
			)}

			{error && !isSyncing && <div className="chat-sync-error">❌ {error}</div>}

			<div className="chat-sync-logs">
				{logs.map((log) => (
					<div
						key={log.id}
						className={`chat-sync-log-line${log.error ? " is-error" : ""}${log.done ? " is-done" : ""}`}
						style={{ color: log.error ? "var(--text-error)" : OP_COLORS[log.operation], opacity: log.done ? 0.6 : 1 }}
					>
						<span className="chat-sync-log-icon">{OP_ICONS[log.operation] || "•"}</span>
						<span className="chat-sync-log-text">{log.message}</span>
						{log.done && <span className="chat-sync-log-done">✓</span>}
					</div>
				))}
				<div ref={logsEndRef} />
			</div>

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
