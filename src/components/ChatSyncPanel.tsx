// src/components/ChatSyncPanel.tsx
// T42g: sync visibility panel rebuilt around the SyncStatusHub. Five
// surfaces — off / idle / syncing / complete / conflicts+errors — fed by
// the hub so auto-sync, settings "Sync Now", and command-palette runs all
// surface here. Design approved via Luna mockups r4 (2026-09-19).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "obsidian";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { SyncLogEntry, SyncProgressSnapshot } from "../sync/SyncProgress";
import type { SyncExamination } from "../sync/SyncEngine";
import {
	formatBytes,
	formatRate,
	type SyncStatusSnapshot,
} from "../sync/SyncStatusHub";
import { SyncLogger, SyncLogModal } from "../sync/SyncLogger";

export type { SyncLogEntry, SyncProgressSnapshot } from "../sync/SyncProgress";
export type SyncDirection = "both" | "upload" | "download";
export type SyncProgress = SyncProgressSnapshot;

interface ChatSyncPanelProps {
	plugin: ChatPluginLike;
}

const DIRECTION_OPTIONS: { value: SyncDirection; label: string }[] = [
	{ value: "both", label: "Both directions" },
	{ value: "upload", label: "Upload only" },
	{ value: "download", label: "Download only" },
];

const EXAM_ROW_CAP = 10;

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

function relativeTime(ts: number): string {
	const secs = Math.max(1, Math.floor((Date.now() - ts) / 1000));
	if (secs < 60) return `${secs}s ago`;
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.floor(hrs / 24)}d ago`;
}

type RowKind = "done" | "conflict" | "failed" | "skipped" | "active" | "info";

function classify(entry: SyncLogEntry): RowKind {
	if (entry.status === "error") return "failed";
	if (entry.status === "active") return "active";
	if (entry.operation === "conflict") return "conflict";
	if (entry.operation === "skip") return "skipped";
	if (entry.operation === "system") return "info";
	return "done";
}

const CHIP_LABEL: Record<RowKind, string> = {
	done: "done",
	conflict: "overwritten",
	failed: "failed",
	skipped: "skipped",
	active: "syncing",
	info: "info",
};

const OP_ARROW: Record<string, string> = {
	upload: "↑",
	download: "↓",
	conflict: "⚡",
	skip: "⊘",
	error: "⚠",
	system: "·",
};

function LogRow({ entry, chip }: { entry: SyncLogEntry; chip?: boolean }) {
	const kind = classify(entry);
	return (
		<div className={`sync-log-row sync-log-row--${kind}`}>
			<span className="sync-log-row-op">
				{OP_ARROW[entry.operation] ?? "·"}
			</span>
			<div className="sync-log-row-main">
				<div className="sync-log-row-title" title={entry.title}>
					{entry.title}
				</div>
				{entry.message && kind !== "done" && (
					<div className="sync-log-row-msg">{entry.message}</div>
				)}
			</div>
			{chip && (
				<span className={`sync-chip sync-chip--${kind}`}>
					{CHIP_LABEL[kind]}
				</span>
			)}
		</div>
	);
}

// ── Component ────────────────────────────────────────────────────────────

const ChatSyncPanel: React.FC<ChatSyncPanelProps> = ({ plugin }) => {
	const hub = plugin.syncHub ?? null;
	const [snap, setSnap] = useState<SyncStatusSnapshot | null>(
		hub?.getSnapshot() ?? null,
	);
	const [tab, setTab] = useState<"summary" | "activity">("summary");
	const [showAll, setShowAll] = useState(false);
	const [direction, setDirection] = useState<SyncDirection>(
		(plugin.settings.remoteStorage?.syncDirection as SyncDirection) ??
			"both",
	);
	const [busy, setBusy] = useState(false);
	const [exam, setExam] = useState<SyncExamination | null>(null);
	const [examBusy, setExamBusy] = useState(false);
	const [examError, setExamError] = useState<string | null>(null);
	const [examShowAll, setExamShowAll] = useState(false);
	const snapRef = useRef(snap);
	snapRef.current = snap;

	useEffect(() => {
		if (!hub) return;
		const off = hub.subscribe((s) => {
			setSnap({ ...s, runLog: [...s.runLog] });
			if (s.state === "syncing") {
				setShowAll(false);
				setExam(null);
				setExamError(null);
			}
		});
		return off;
	}, [hub]);

	const syncConfigured = Boolean(
		plugin.settings.remoteStorage?.enabled &&
		plugin.settings.remoteStorage?.backend &&
		plugin.settings.remoteStorage?.backend !== "none",
	);
	const hubState = snap?.state ?? "disabled";
	const state = syncConfigured ? hubState : "disabled";
	const lastResult = snap?.lastResult ?? null;
	const runLog = useMemo(() => snap?.runLog ?? [], [snap]);
	const failures = useMemo(() => snap?.failures ?? [], [snap]);
	const progress = snap?.progress ?? null;

	const startSync = async (dry: boolean) => {
		if (!plugin.triggerSync || busy) return;
		setBusy(true);
		try {
			await plugin.triggerSync(dry, { direction });
		} catch (err: any) {
			new Notice(`Sync failed: ${err?.message ?? err}`, 6000);
		} finally {
			setBusy(false);
		}
	};

	const runExamine = async () => {
		if (!plugin.examineSync || examBusy) return;
		setExamBusy(true);
		setExamError(null);
		try {
			const result = await plugin.examineSync(direction);
			setExam(result);
		} catch (err: any) {
			setExamError(err?.message ?? String(err));
		} finally {
			setExamBusy(false);
		}
	};

	const onDirectionChange = (d: SyncDirection) => {
		setDirection(d);
		// A previous examine no longer matches the selected direction.
		setExam(null);
		setExamError(null);
	};


	const openLogModal = async () => {
		const logger = new SyncLogger(plugin.app, plugin.manifest.id);
		const lines = await logger.readRecent(200);
		new SyncLogModal(plugin.app, lines).open();
	};

	const counts = useMemo(() => {
		const c = { done: 0, conflict: 0, failed: 0, skipped: 0 };
		for (const e of runLog) {
			const k = classify(e);
			if (k === "done") c.done++;
			else if (k === "conflict") c.conflict++;
			else if (k === "failed") c.failed++;
			else if (k === "skipped") c.skipped++;
		}
		return c;
	}, [runLog]);

	const visibleLog = showAll ? runLog : runLog.slice(-5);
	const examRowsTotal =
		(exam?.upload.length ?? 0) +
		(exam?.download.length ?? 0) +
		(exam?.conflicts.length ?? 0);
	const examRows = useMemo<SyncLogEntry[]>(() => {
		if (!exam) return [];
		const now = Date.now();
		const row = (
			id: string,
			operation: SyncLogEntry["operation"],
			title: string,
		): SyncLogEntry => ({
			id,
			operation,
			title,
			status: "pending",
			timestamp: now,
		});
		const rows = [
			...exam.upload.map((s) => row(`up:${s.id}`, "upload", s.title)),
			...exam.download.map((s) =>
				row(`down:${s.id}`, "download", s.title),
			),
			...exam.conflicts.map((s) =>
				row(`conf:${s.id}`, "conflict", s.title),
			),
		];
		return examShowAll ? rows : rows.slice(0, EXAM_ROW_CAP);
	}, [exam, examShowAll]);
	const activeRows = runLog.filter((e) => e.status === "active").slice(-3);

	// ── Off ──
	if (state === "disabled") {
		return (
			<div className="sync-panel">
				<div className="sync-eyebrow">Remote sync</div>
				<div className="sync-card sync-card--empty">
					<div className="sync-card-title">Sync is off</div>
					<div className="sync-card-sub">
						Connect WebDAV or S3 to keep chats, memory, and settings
						aligned across devices.
					</div>
					{plugin.openRemoteStorageSettings && (
						<button
							className="sync-btn sync-btn--primary"
							onClick={() => plugin.openRemoteStorageSettings?.()}
						>
							Set up sync
						</button>
					)}
				</div>
			</div>
		);
	}

	// ── Idle ──
	if (state === "idle" || state === "connecting" || state === "error") {
		const lastBytes =
			(lastResult?.uploadedBytes ?? 0) +
			(lastResult?.downloadedBytes ?? 0);
		const lastRate = formatRate(lastBytes, lastResult?.durationMs ?? 0);
		return (
			<div className="sync-panel">
				<div
					className={`sync-strip sync-strip--${state === "error" && lastResult && !lastResult.ok ? "error" : "idle"}`}
				>
					<span
						className={`sync-dot ${state === "error" ? "sync-dot--error" : "sync-dot--ok"}`}
					/>
					<span>
						{state === "connecting"
							? "Connecting…"
							: lastResult
								? `Last sync ${relativeTime(lastResult.finishedAt)}`
								: "Sync idle"}
					</span>
				</div>

				{lastResult && (
					<div
						className={`sync-card ${lastResult.ok ? "" : "sync-card--danger"}`}
					>
						<div className="sync-card-eyebrow">
							{lastResult.dryRun ? "Last dry run" : "Last sync"}
						</div>
						<div className="sync-card-title">
							{lastResult.ok
								? lastResult.message || "Complete"
								: "Finished with attention"}
						</div>
						<div className="sync-card-sub">
							↑{lastResult.uploaded} ↓{lastResult.downloaded} ⚡
							{lastResult.conflicts} ⊘{lastResult.skipped}
							{lastBytes > 0 &&
								` · ${formatBytes(lastBytes)}${
									lastResult.durationMs
										? ` at ${lastRate}`
										: ""
								}`}
							{lastResult.durationMs
								? ` · ${formatDuration(lastResult.durationMs)}`
								: ""}
						</div>
						{!lastResult.ok && lastResult.errors.length > 0 && (
							<div className="sync-card-error">
								{lastResult.errors[0]}
							</div>
						)}
					</div>
				)}

				<div className="sync-card">
					<div className="sync-card-eyebrow">Step 1 · Examine</div>
					<div className="sync-card-title">Compare stores</div>
					<div className="sync-card-sub">
						Counts sessions on this device and on the remote store, and
						lists what a sync would transfer. Nothing moves yet.
					</div>
					<button
						className="sync-btn sync-btn--ghost"
						disabled={busy || examBusy || !plugin.examineSync}
						onClick={runExamine}
					>
						{examBusy
							? "Examining…"
							: exam
								? "Re-examine"
								: "Examine stores"}
					</button>
					{examError && (
						<div className="sync-card-error">{examError}</div>
					)}
					{exam && (
						<>
							<div className="sync-stats-grid">
								<div className="sync-stat">
									<div className="sync-stat-num">
										{exam.localCount}
									</div>
									<div className="sync-stat-label">local</div>
								</div>
								<div className="sync-stat">
									<div className="sync-stat-num">
										{exam.remoteCount}
									</div>
									<div className="sync-stat-label">remote</div>
								</div>
								<div
									className={`sync-stat ${exam.upload.length === 0 ? "sync-stat--dim" : ""}`}
								>
									<div className="sync-stat-num">
										{exam.upload.length}
									</div>
									<div className="sync-stat-label">
										to upload
									</div>
								</div>
								<div
									className={`sync-stat ${exam.download.length === 0 ? "sync-stat--dim" : ""}`}
								>
									<div className="sync-stat-num">
										{exam.download.length}
									</div>
									<div className="sync-stat-label">
										to download
									</div>
								</div>
								<div
									className={`sync-stat sync-stat--warn ${exam.conflicts.length === 0 ? "sync-stat--dim" : ""}`}
								>
									<div className="sync-stat-num">
										{exam.conflicts.length}
									</div>
									<div className="sync-stat-label">
										conflicts
									</div>
								</div>
								<div
									className={`sync-stat ${exam.unchanged === 0 ? "sync-stat--dim" : ""}`}
								>
									<div className="sync-stat-num">
										{exam.unchanged}
									</div>
									<div className="sync-stat-label">
										unchanged
									</div>
								</div>
							</div>
							<div className="sync-card-sub">
								{examRowsTotal > 0
									? `Pending: ${examRowsTotal} · ↑${formatBytes(exam.uploadBytes)} ↓${formatBytes(exam.downloadBytes)}`
								: "Stores match — nothing to transfer."}
							</div>
							{examRowsTotal > 0 && (
								<div className="sync-log">
									{examRows.map((e) => (
										<LogRow key={e.id} entry={e} />
									))}
								</div>
							)}
							{examRowsTotal > EXAM_ROW_CAP && (
								<button
									className="sync-link"
									onClick={() => setExamShowAll((v) => !v)}
								>
									{examShowAll
										? "Show less"
										: `Show all ${examRowsTotal}`}
								</button>
							)}
						</>
					)}
				</div>

				{/* Complete surface: stats grid + full op log persist until the
				    next run begins (hub clears runLog on beginRun). */}
				{runLog.length > 0 && (
					<div className="sync-complete">
						<div className="sync-stats-grid">
							<div
								className={`sync-stat sync-stat--success ${counts.done === 0 ? "sync-stat--dim" : ""}`}
							>
								<div className="sync-stat-num">
									{counts.done}
								</div>
								<div className="sync-stat-label">done</div>
							</div>
							<div
								className={`sync-stat sync-stat--warn ${counts.conflict === 0 ? "sync-stat--dim" : ""}`}
							>
								<div className="sync-stat-num">
									{counts.conflict}
								</div>
								<div className="sync-stat-label">
									overwritten
								</div>
							</div>
							<div
								className={`sync-stat ${counts.skipped === 0 ? "sync-stat--dim" : ""}`}
							>
								<div className="sync-stat-num">
									{counts.skipped}
								</div>
								<div className="sync-stat-label">skipped</div>
							</div>
							<div
								className={`sync-stat sync-stat--danger ${counts.failed === 0 ? "sync-stat--dim" : ""}`}
							>
								<div className="sync-stat-num">
									{counts.failed}
								</div>
								<div className="sync-stat-label">errors</div>
							</div>
						</div>
						<div className="sync-log">
							{visibleLog.map((e) => (
								<LogRow key={e.id} entry={e} chip />
							))}
						</div>
						{runLog.length > 5 && (
							<button
								className="sync-link"
								onClick={() => setShowAll((v) => !v)}
							>
								{showAll
									? "Show less"
									: `Show all ${runLog.length}`}
							</button>
						)}
					</div>
				)}

				{failures.length > 0 && (
					<div className="sync-card sync-card--danger">
						<div className="sync-card-eyebrow">
							Failed operations
						</div>
						{failures.slice(-4).map((f, i) => (
							<div key={i} className="sync-fail-row">
								<div className="sync-fail-row-title">
									{f.title}
								</div>
								<div className="sync-fail-row-msg">
									{f.message} · {relativeTime(f.timestamp)}
								</div>
							</div>
						))}
						<button
							className="sync-btn sync-btn--danger"
							disabled={busy}
							onClick={() => startSync(false)}
						>
							Retry sync
						</button>
					</div>
				)}

				<div className="sync-card">
					<div className="sync-card-eyebrow">Step 2 · Sync</div>
					<div className="sync-card-sub">
						Transfers whatever Step 1 found.
					</div>
					<div className="sync-controls">
						<select
							className="sync-select"
							value={direction}
							disabled={busy}
							onChange={(e) =>
								onDirectionChange(e.target.value as SyncDirection)
							}
						>
							{DIRECTION_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
						<div className="sync-controls-row">
							<button
								className="sync-btn sync-btn--ghost"
								disabled={busy}
								onClick={() => startSync(true)}
							>
								🔍 Dry run
							</button>
							<button
								className="sync-btn sync-btn--primary"
								disabled={busy}
								onClick={() => startSync(false)}
							>
								{busy ? "Syncing…" : "Sync now"}
							</button>
							{plugin.openRemoteStorageSettings && (
								<button
									className="sync-btn sync-btn--icon"
									aria-label="Sync settings"
									onClick={() =>
										plugin.openRemoteStorageSettings?.()
									}
								>
									⚙
								</button>
							)}
						</div>
					</div>
				</div>

				<button className="sync-link" onClick={openLogModal}>
					View sync log
				</button>
			</div>
		);
	}

	// ── Syncing ──
	const total = progress?.total ?? 0;
	const completed = progress?.completed ?? 0;
	const pct =
		progress?.indeterminate || total === 0
			? null
			: Math.min(100, Math.round((completed / total) * 100));
	const bytesNow =
		(progress?.uploadedBytes ?? 0) + (progress?.downloadedBytes ?? 0);
	const rate = formatRate(bytesNow, progress?.elapsedMs ?? 0);

	return (
		<div className="sync-panel">
			<div className="sync-strip sync-strip--syncing">
				<span className="sync-dot sync-dot--pulse" />
				<span>{progress?.stage ?? "Syncing…"}</span>
			</div>

			<div className="sync-progress">
				<div className="sync-progress-head">
					<span>{progress?.stage ?? "Working…"}</span>
					{total > 0 && (
						<span className="sync-progress-count">
							{completed}/{total}
						</span>
					)}
				</div>
				<div className="sync-progress-track">
					{pct === null ? (
						<div className="sync-progress-indeterminate" />
					) : (
						<div
							className="sync-progress-fill"
							style={{ width: `${pct}%` }}
						/>
					)}
				</div>
				<div className="sync-progress-meta">
					{formatDuration(progress?.elapsedMs ?? 0)}
					{(progress?.uploadedBytes ?? 0) > 0 &&
						` · ↑${formatBytes(progress!.uploadedBytes!)}`}
					{(progress?.downloadedBytes ?? 0) > 0 &&
						` · ↓${formatBytes(progress!.downloadedBytes!)}`}
					{` · ${rate}`}
				</div>
			</div>

			{activeRows.length > 0 && (
				<div className="sync-ops">
					{activeRows.map((e) => (
						<div
							key={e.id}
							className="sync-op-row sync-op-row--active"
						>
							<span className="sync-op-shimmer" />
							<span className="sync-log-row-op">
								{OP_ARROW[e.operation] ?? "·"}
							</span>
							<span className="sync-op-row-title" title={e.title}>
								{e.title}
							</span>
						</div>
					))}
				</div>
			)}

			<div className="sync-tabs">
				<button
					className={`sync-tab ${tab === "summary" ? "sync-tab--active" : ""}`}
					onClick={() => setTab("summary")}
				>
					Summary
				</button>
				<button
					className={`sync-tab ${tab === "activity" ? "sync-tab--active" : ""}`}
					onClick={() => setTab("activity")}
				>
					Activity{runLog.length > 0 ? ` (${runLog.length})` : ""}
				</button>
			</div>

			{tab === "summary" ? (
				<div className="sync-stats-grid">
					<div className="sync-stat sync-stat--success">
						<div className="sync-stat-num">{counts.done}</div>
						<div className="sync-stat-label">done</div>
					</div>
					<div
						className={`sync-stat sync-stat--warn ${counts.conflict === 0 ? "sync-stat--dim" : ""}`}
					>
						<div className="sync-stat-num">{counts.conflict}</div>
						<div className="sync-stat-label">overwritten</div>
					</div>
					<div
						className={`sync-stat ${counts.skipped === 0 ? "sync-stat--dim" : ""}`}
					>
						<div className="sync-stat-num">{counts.skipped}</div>
						<div className="sync-stat-label">skipped</div>
					</div>
					<div
						className={`sync-stat sync-stat--danger ${counts.failed === 0 ? "sync-stat--dim" : ""}`}
					>
						<div className="sync-stat-num">{counts.failed}</div>
						<div className="sync-stat-label">errors</div>
					</div>
				</div>
			) : (
				<div className="sync-feed">
					{runLog.length === 0 ? (
						<div className="sync-feed-empty">
							Waiting for operations…
						</div>
					) : (
						runLog.map((e) => <LogRow key={e.id} entry={e} />)
					)}
					<div className="sync-feed-fade" />
				</div>
			)}

			<div className="sync-panel-foot">
				<button
					className="sync-btn sync-btn--ghost"
					onClick={() => plugin.cancelSync?.()}
				>
					Cancel
				</button>
				{runLog.length > 0 && (
					<span className="sync-panel-foot-meta">
						{runLog.length} operations
					</span>
				)}
			</div>
		</div>
	);
};

export default React.memo(ChatSyncPanel);
