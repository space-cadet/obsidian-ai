import { Modal, App } from "obsidian";
import type { SyncResult } from "../sync/StorageAdapter";
import type { SyncExamination } from "../sync/SyncEngine";

export type SyncDirection = "both" | "upload" | "download";

interface LogEntry {
	id?: string;
	time: string;
	icon: string;
	text: string;
	done?: boolean;
	error?: boolean;
}

export interface SyncProgressModalOptions {
	onCancel?: () => void;
	onExamine?: (direction: SyncDirection) => Promise<SyncExamination | null>;
	onRebuildIndex?: (
		direction: SyncDirection,
	) => Promise<SyncExamination | null>;
	onConfirm?: (direction: SyncDirection) => void;
	onEarlyClose?: () => void;
	dryRunOnly?: boolean;
	defaultDirection?: SyncDirection;
}

const DIRECTION_LABELS: Record<SyncDirection, string> = {
	both: "Both directions",
	upload: "Upload only",
	download: "Download only",
};

const EXAM_ROW_CAP = 10;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

export class SyncProgressModal extends Modal {
	private startTime: number;
	private totalSessions: number;
	private completedCount: number = 0;
	private isComplete: boolean = false;
	private currentFileEl!: HTMLElement;
	private progressTrackEl!: HTMLElement;
	private progressFillEl!: HTMLElement;
	private percentEl!: HTMLElement;
	private elapsedEl!: HTMLElement;
	private sessionCountEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private summaryEl!: HTMLElement;
	private logContainer!: HTMLElement;
	private cancelBtn!: HTMLElement;
	private backgroundBtn!: HTMLElement;
	private doneBtn!: HTMLElement;
	private onCancel?: () => void;
	private onExamine?: (
		direction: SyncDirection,
	) => Promise<SyncExamination | null>;
	private onRebuildIndex?: (
		direction: SyncDirection,
	) => Promise<SyncExamination | null>;
	private onConfirm?: (direction: SyncDirection) => void;
	private onEarlyClose?: () => void;
	private dryRunOnly: boolean;
	private phase: "examine" | "progress";
	private direction: SyncDirection;
	private exam: SyncExamination | null = null;
	private examBusy: boolean = false;
	private confirmed: boolean = false;
	private logEntries: LogEntry[] = [];
	private maxEntries: number = 100;
	private examStatusEl: HTMLElement | null = null;
	private examBodyEl: HTMLElement | null = null;
	private examDirEl: HTMLSelectElement | null = null;
	private syncNowBtn: HTMLButtonElement | null = null;
	private rebuildIndexBtn: HTMLButtonElement | null = null;

	constructor(
		app: App,
		totalSessions: number,
		options?: SyncProgressModalOptions,
	) {
		super(app);
		this.startTime = Date.now();
		this.totalSessions = totalSessions;
		this.onCancel = options?.onCancel;
		this.onExamine = options?.onExamine;
		this.onRebuildIndex = options?.onRebuildIndex;
		this.onConfirm = options?.onConfirm;
		this.onEarlyClose = options?.onEarlyClose;
		this.dryRunOnly = options?.dryRunOnly ?? false;
		this.direction = options?.defaultDirection ?? "both";
		this.phase = this.onExamine ? "examine" : "progress";
	}

	onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("sync-progress-modal");
		this.modalEl?.addClass?.("sync-progress-modal-window");
		if (this.phase === "examine") {
			this.renderExamine();
			void this.runExamine();
		} else {
			this.renderProgress();
		}
	}

	onClose() {
		if (this.phase === "examine" && !this.confirmed) {
			this.onEarlyClose?.();
		}
		this.contentEl.empty();
		this.modalEl?.removeClass?.("sync-progress-modal-window");
	}

	// ── Phase 1: examine ────────────────────────────────────────────────

	private renderExamine(): void {
		const { contentEl } = this;

		const header = contentEl.createDiv("sync-header");
		const title = header.createEl("span", "sync-header-title");
		title.setText(this.dryRunOnly ? "🔍 Sync dry run" : "🔄 Sync");
		const sub = header.createEl("div", "sync-header-subtitle");
		sub.setText("Step 1 of 2 · nothing moves yet — review, then sync.");

		const dirRow = contentEl.createDiv("sync-exam-dir");
		dirRow.createEl("label", { text: "Direction" });
		this.examDirEl = dirRow.createEl("select");
		for (const [value, label] of Object.entries(DIRECTION_LABELS)) {
			this.examDirEl.createEl("option", { text: label, value });
		}
		this.examDirEl.value = this.direction;
		this.examDirEl.addEventListener("change", () => {
			this.direction = this.examDirEl!.value as SyncDirection;
			void this.runExamine();
		});

		this.examStatusEl = contentEl.createDiv("sync-exam-status");
		this.examStatusEl.setText("Examining stores…");
		this.examBodyEl = contentEl.createDiv("sync-exam-body");

		const btnRow = contentEl.createDiv("sync-btn-row");
		this.syncNowBtn = btnRow.createEl("button", { text: "Sync now" });
		this.syncNowBtn.disabled = true;
		this.syncNowBtn.addEventListener("click", () => this.confirm());
		if (this.dryRunOnly) this.syncNowBtn.addClass("sync-btn-hidden");
		this.rebuildIndexBtn = btnRow.createEl("button", {
			text: "Rebuild index",
		});
		this.rebuildIndexBtn.addEventListener("click", () => {
			void this.rebuildIndex();
		});
		if (!this.onRebuildIndex) {
			this.rebuildIndexBtn.addClass("sync-btn-hidden");
		}
		const cancelBtn = btnRow.createEl("button", {
			text: this.dryRunOnly ? "Close" : "Cancel",
		});
		cancelBtn.addEventListener("click", () => this.close());
	}

	private async runExamine(): Promise<void> {
		if (!this.onExamine || this.examBusy || this.phase !== "examine")
			return;
		this.examBusy = true;
		this.exam = null;
		if (this.syncNowBtn) this.syncNowBtn.disabled = true;
		if (this.rebuildIndexBtn) this.rebuildIndexBtn.disabled = true;
		if (this.examDirEl) this.examDirEl.disabled = true;
		if (this.examStatusEl) this.examStatusEl.setText("Examining stores…");
		if (this.examBodyEl) this.examBodyEl.empty();
		try {
			const exam = await this.onExamine(this.direction);
			if (this.phase !== "examine") return;
			if (!exam) {
				this.examStatusEl?.setText(
					"Sync is not configured — enable Remote Storage in settings.",
				);
				return;
			}
			this.exam = exam;
			const pending =
				exam.upload.length +
				exam.download.length +
				exam.conflicts.length +
				(exam.deleteRemote?.length ?? 0) +
				(exam.deleteLocal?.length ?? 0);
			this.examStatusEl?.setText(
				pending > 0
					? `Pending: ↑${formatBytes(exam.uploadBytes)} · ↓${formatBytes(exam.downloadBytes)}`
					: "Stores match — nothing to transfer.",
			);
			this.renderExamResults(exam);
			if (!this.dryRunOnly && this.syncNowBtn)
				this.syncNowBtn.disabled = false;
		} catch (err) {
			this.examStatusEl?.setText(
				`Examine failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			this.examBusy = false;
			if (this.examDirEl) this.examDirEl.disabled = false;
			if (this.rebuildIndexBtn) this.rebuildIndexBtn.disabled = false;
		}
	}

	private async rebuildIndex(): Promise<void> {
		if (!this.onRebuildIndex || this.examBusy || this.phase !== "examine") {
			return;
		}
		this.examBusy = true;
		this.exam = null;
		if (this.syncNowBtn) this.syncNowBtn.disabled = true;
		if (this.rebuildIndexBtn) this.rebuildIndexBtn.disabled = true;
		if (this.examDirEl) this.examDirEl.disabled = true;
		this.examStatusEl?.setText("Rebuilding sync index…");
		try {
			const exam = await this.onRebuildIndex(this.direction);
			if (this.phase !== "examine") return;
			if (!exam) {
				this.examStatusEl?.setText(
					"Sync index is not configured — enable Remote Storage in settings.",
				);
				return;
			}
			this.exam = exam;
			const pending =
				exam.upload.length +
				exam.download.length +
				exam.conflicts.length +
				(exam.deleteRemote?.length ?? 0) +
				(exam.deleteLocal?.length ?? 0);
			this.examStatusEl?.setText(
				pending > 0
					? "Index rebuilt — review the refreshed plan."
					: "Stores match — nothing to transfer.",
			);
			this.renderExamResults(exam);
			if (!this.dryRunOnly && this.syncNowBtn) {
				this.syncNowBtn.disabled = false;
			}
		} catch (err) {
			this.examStatusEl?.setText(
				`Index rebuild failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			this.examBusy = false;
			if (this.examDirEl) this.examDirEl.disabled = false;
			if (this.rebuildIndexBtn) this.rebuildIndexBtn.disabled = false;
		}
	}

	private renderExamResults(exam: SyncExamination): void {
		if (!this.examBodyEl) return;
		this.examBodyEl.empty();

		const grid = this.examBodyEl.createDiv("sync-exam-grid");
		const cells: Array<[number, string, string]> = [
			[exam.localCount, "local", ""],
			[exam.remoteCount, "remote", ""],
			[
				exam.upload.length,
				"to upload",
				exam.upload.length === 0 ? "sync-exam-stat--dim" : "",
			],
			[
				exam.download.length,
				"to download",
				exam.download.length === 0 ? "sync-exam-stat--dim" : "",
			],
			[
				exam.conflicts.length,
				"conflicts",
				exam.conflicts.length === 0
					? "sync-exam-stat--dim"
					: "sync-exam-stat--warn",
			],
			[
				(exam.deleteRemote?.length ?? 0) +
					(exam.deleteLocal?.length ?? 0),
				"to delete",
				(exam.deleteRemote?.length ?? 0) +
					(exam.deleteLocal?.length ?? 0) ===
				0
					? "sync-exam-stat--dim"
					: "sync-exam-stat--warn",
			],
			[
				exam.unchanged,
				"unchanged",
				exam.unchanged === 0 ? "sync-exam-stat--dim" : "",
			],
		];
		for (const [num, label, cls] of cells) {
			const cell = grid.createDiv(`sync-exam-stat ${cls}`.trim());
			cell.createDiv("sync-exam-num").setText(String(num));
			cell.createDiv("sync-exam-label").setText(label);
		}

		const rows: Array<[string, string]> = [
			...exam.upload.map((s): [string, string] => ["↑", s.title]),
			...exam.download.map((s): [string, string] => ["↓", s.title]),
			...exam.conflicts.map((s): [string, string] => ["⚡", s.title]),
			...(exam.deleteRemote ?? []).map((s): [string, string] => [
				"⌫",
				s.title,
			]),
			...(exam.deleteLocal ?? []).map((id): [string, string] => [
				"⌫",
				id,
			]),
		];
		if (rows.length > 0) {
			const list = this.examBodyEl.createDiv("sync-exam-rows");
			for (const [icon, title] of rows.slice(0, EXAM_ROW_CAP)) {
				const row = list.createDiv("sync-exam-row");
				row.createDiv("sync-exam-row-icon").setText(icon);
				row.createDiv("sync-exam-row-title").setText(title);
			}
			if (rows.length > EXAM_ROW_CAP) {
				this.examBodyEl
					.createDiv("sync-exam-note")
					.setText(`… and ${rows.length - EXAM_ROW_CAP} more`);
			}
		}
		if (exam.conflicts.length > 0) {
			this.examBodyEl
				.createDiv("sync-exam-note")
				.setText("⚡ Conflicts resolve per your conflict strategy.");
		}
	}

	private confirm(): void {
		if (this.phase !== "examine" || !this.exam || this.dryRunOnly) return;
		this.phase = "progress";
		this.confirmed = true;
		const direction = this.direction;
		this.contentEl.empty();
		this.renderProgress();
		this.onConfirm?.(direction);
	}

	// ── Phase 2: progress ───────────────────────────────────────────────

	private renderProgress(): void {
		const { contentEl } = this;

		// Header
		const header = contentEl.createDiv("sync-header");
		const title = header.createEl("span", "sync-header-title");
		title.setText("🔄 Syncing");
		this.elapsedEl = header.createEl("span", "sync-header-elapsed");
		this.elapsedEl.setText("0s");

		// Status row
		const statusRow = contentEl.createDiv("sync-status-row");
		this.statusEl = statusRow.createEl("span", "sync-status");
		this.statusEl.setText("Preparing sync…");
		this.sessionCountEl = statusRow.createEl("span", "sync-session-count");
		this.updateSessionCount();

		// Progress bar
		const progressContainer = contentEl.createDiv(
			"sync-progress-container",
		);
		this.progressTrackEl = progressContainer.createDiv(
			"sync-progress-track",
		);
		this.progressFillEl =
			this.progressTrackEl.createDiv("sync-progress-fill");
		this.percentEl = progressContainer.createEl(
			"span",
			"sync-progress-percent",
		);
		this.percentEl.setText("0%");

		// Current file indicator
		this.currentFileEl = contentEl.createDiv("sync-current-file");
		this.currentFileEl.setText("Initializing…");

		// Log section
		const logSection = contentEl.createDiv("sync-log-section");
		logSection.createEl("h4", { text: "Activity Log" });
		this.logContainer = logSection.createDiv("sync-log-container");
		this.summaryEl = contentEl.createDiv("sync-summary");
		this.summaryEl.setText("⏱ 0.0s · ↑0 ↓0 ⚡0 ⊘0");

		// Buttons
		const btnRow = contentEl.createDiv("sync-btn-row");
		this.cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		this.cancelBtn.addEventListener("click", () => {
			this.onCancel?.();
			this.cancelBtn.setText("Cancelling…");
			this.cancelBtn.setAttribute("disabled", "true");
		});

		this.backgroundBtn = btnRow.createEl("button", { text: "Background" });
		this.backgroundBtn.addEventListener("click", () => this.close());

		this.doneBtn = btnRow.createEl("button", { text: "Done" });
		this.doneBtn.addClass("sync-btn-hidden");
		this.doneBtn.addEventListener("click", () => this.close());

		this.updateElapsed();
	}

	private updateElapsed(): void {
		if (this.isComplete) return;

		const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
		if (this.elapsedEl) {
			this.elapsedEl.setText(`${elapsed}s`);
		}

		setTimeout(() => this.updateElapsed(), 1000);
	}

	private updateSessionCount(): void {
		if (this.sessionCountEl) {
			this.sessionCountEl.setText(
				`${this.completedCount} / ${this.totalSessions || "?"}`,
			);
		}
	}

	addLog(
		icon: string,
		text: string,
		opts?: { id?: string; done?: boolean; error?: boolean },
	): void {
		const time = new Date().toLocaleTimeString();
		const displayIcon: Record<string, string> = {
			system: "•",
			upload: "↑",
			download: "↓",
			conflict: "⚡",
			delete: "⌫",
			skip: "⊘",
			error: "✗",
		};
		const entry: LogEntry = {
			id: opts?.id,
			time,
			icon: displayIcon[icon] ?? icon,
			text,
			done: opts?.done,
			error: opts?.error,
		};
		const existingIndex = opts?.id
			? this.logEntries.findIndex((item) => item.id === opts.id)
			: -1;
		if (existingIndex >= 0) {
			this.logEntries[existingIndex] = entry;
			this.renderAllLogEntries();
			return;
		}
		this.logEntries.push(entry);

		// Keep only the last N entries to prevent DOM bloat
		if (this.logEntries.length > this.maxEntries) {
			this.logEntries = this.logEntries.slice(-this.maxEntries);
			this.renderAllLogEntries();
			return;
		}

		this.renderLogEntry(entry);
	}

	private renderAllLogEntries(): void {
		if (!this.logContainer) return;
		this.logContainer.empty();
		for (const entry of this.logEntries) this.renderLogEntry(entry);
		this.logContainer.scrollTop = this.logContainer.scrollHeight;
	}

	private renderLogEntry(entry: LogEntry): void {
		const logEntry = this.logContainer.createDiv("sync-log-entry");
		if (entry.error) logEntry.addClass("sync-log-error");
		if (entry.done) logEntry.addClass("sync-log-done");

		const timeSpan = logEntry.createSpan();
		timeSpan.addClass("sync-log-time");
		timeSpan.setText(entry.time);

		const iconSpan = logEntry.createSpan();
		iconSpan.addClass("sync-log-icon");
		iconSpan.setText(entry.icon);

		const textSpan = logEntry.createSpan();
		textSpan.addClass("sync-log-text");
		textSpan.setText(entry.text);
	}

	setTotal(total: number): void {
		this.totalSessions = total;
		this.updateSessionCount();
	}

	updateCurrentFile(filename: string): void {
		if (this.currentFileEl) {
			this.currentFileEl.setText(filename);
		}
	}

	updateProgress(completed: number): void {
		this.completedCount = completed;

		// Calculate percentage
		const percent =
			this.totalSessions > 0
				? Math.round((completed / this.totalSessions) * 100)
				: 0;

		// Update progress bar
		if (this.progressFillEl) {
			this.progressFillEl.setCssProps({
				width: `${percent}%`,
			});
		}

		if (this.percentEl) {
			this.percentEl.setText(`${percent}%`);
		}

		this.updateSessionCount();
	}

	onComplete(result: SyncResult): void {
		this.isComplete = true;

		// Hide cancel button, show done button
		if (this.cancelBtn) {
			this.cancelBtn.addClass("sync-btn-hidden");
		}
		if (this.backgroundBtn) {
			this.backgroundBtn.addClass("sync-btn-hidden");
		}
		if (this.doneBtn) {
			this.doneBtn.removeClass("sync-btn-hidden");
		}

		// Update title to show completion
		const title = this.contentEl.querySelector(".sync-header-title");
		if (title) {
			title.setText(
				result.status === "failed"
					? "⚠️ Sync Finished with Errors"
					: "✅ Sync Complete",
			);
		}

		// Update status
		if (this.statusEl) {
			this.statusEl.setText(result.message ?? "");
		}

		if (this.currentFileEl) {
			this.currentFileEl.setText("");
		}
		if (this.summaryEl) {
			const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
			this.summaryEl.setText(
				`⏱ ${elapsed}s · ↑${result.uploaded} ↓${result.downloaded} ⚡${result.conflicts} ⌫${result.deleted ?? 0} ⊘${result.skipped}`,
			);
		}

		this.updateProgress(this.totalSessions);
	}

	finish(result: SyncResult): void {
		this.onComplete(result);
	}
}
