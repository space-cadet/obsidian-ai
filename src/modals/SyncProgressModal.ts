import { Modal, App } from "obsidian";
import type { SyncResult } from "../sync/StorageAdapter";
import type { SyncExamination } from "../sync/SyncEngine";
import type { SyncProgressSnapshot } from "../sync/SyncProgress";

export type SyncDirection = "both" | "upload" | "download";

interface LogEntry {
	id?: string;
	time: string;
	icon: string;
	text: string;
	done?: boolean;
	error?: boolean;
}

interface GeneratedTagGroup {
	sessionTitle: string;
	tags: string[];
}

export interface SyncProgressModalOptions {
	onCancel?: () => void;
	title?: string;
	initialStatus?: string;
	initialCurrentFile?: string;
	initialSummary?: string;
	backgroundButtonLabel?: string;
	showBackgroundButton?: boolean;
	closeCancelsOnProgress?: boolean;
	showGeneratedTags?: boolean;
	onExamine?: (direction: SyncDirection) => Promise<SyncExamination | null>;
	onRebuildIndex?: (
		direction: SyncDirection,
		report?: (message: string) => void,
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
	private title: string;
	private initialStatus: string;
	private initialCurrentFile: string;
	private initialSummary: string;
	private backgroundButtonLabel: string;
	private showBackgroundButton: boolean;
	private closeCancelsOnProgress: boolean;
	private showGeneratedTags: boolean;
	private cancellationRequested: boolean = false;
	private leavingInBackground: boolean = false;
	private generatedTagGroups: GeneratedTagGroup[] = [];
	private generatedTagTotal: number = 0;
	private generatedSessionTotal: number = 0;
	private generatedTagsContainer?: HTMLElement;
	private generatedTagsCountEl?: HTMLElement;
	private generatedTagsEmptyEl?: HTMLElement;
	private generatedTagsLiveRegionEl?: HTMLElement;
	private onExamine?: (
		direction: SyncDirection,
	) => Promise<SyncExamination | null>;
	private onRebuildIndex?: (
		direction: SyncDirection,
		report?: (message: string) => void,
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
	private examProgressEl: HTMLElement | null = null;
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
		this.title = options?.title ?? "🔄 Syncing";
		this.initialStatus = options?.initialStatus ?? "Preparing sync…";
		this.initialCurrentFile =
			options?.initialCurrentFile ?? "Initializing…";
		this.initialSummary =
			options?.initialSummary ?? "⏱ 0.0s · ↑0 ↓0 ⚡0 ⊘0";
		this.backgroundButtonLabel =
			options?.backgroundButtonLabel ?? "Background";
		this.showBackgroundButton = options?.showBackgroundButton ?? true;
		this.closeCancelsOnProgress = options?.closeCancelsOnProgress ?? false;
		this.showGeneratedTags = options?.showGeneratedTags ?? false;
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
		if (
			this.phase === "progress" &&
			!this.isComplete &&
			this.closeCancelsOnProgress &&
			!this.leavingInBackground &&
			!this.cancellationRequested
		) {
			this.cancellationRequested = true;
			this.onCancel?.();
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
		this.examProgressEl = contentEl.createDiv("sync-exam-progress");
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
		this.setExamBusyState("Examining stores…");
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
			this.clearExamBusyState();
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
		this.rebuildIndexBtn?.setText("Rebuilding…");
		this.setExamBusyState("Rebuilding sync index…");
		try {
			const exam = await this.onRebuildIndex(
				this.direction,
				(message) => {
					this.setExamBusyState(message);
				},
			);
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
			this.clearExamBusyState();
			this.examBusy = false;
			if (this.examDirEl) this.examDirEl.disabled = false;
			if (this.rebuildIndexBtn) this.rebuildIndexBtn.disabled = false;
			this.rebuildIndexBtn?.setText("Rebuild index");
		}
	}

	private setExamBusyState(message: string): void {
		this.examStatusEl?.setText(`⟳ ${message}`);
		this.examProgressEl?.addClass("is-active");
		this.contentEl.setAttribute("aria-busy", "true");
	}

	private clearExamBusyState(): void {
		this.examProgressEl?.removeClass("is-active");
		this.contentEl.removeAttribute("aria-busy");
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
		// The examination screen can remain open for an arbitrary amount of
		// time. The progress timer measures the actual sync run, so start it
		// when the user approves the Sync action rather than at modal creation.
		this.startTime = Date.now();
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
		title.setText(this.title);
		this.elapsedEl = header.createEl("span", "sync-header-elapsed");
		this.elapsedEl.setText("0s");

		// Status row
		const statusRow = contentEl.createDiv("sync-status-row");
		this.statusEl = statusRow.createEl("span", "sync-status");
		this.statusEl.setText(this.initialStatus);
		this.sessionCountEl = statusRow.createEl("span", "sync-session-count");
		this.updateSessionCount();

		// Progress bar
		const progressContainer = contentEl.createDiv(
			"sync-progress-container",
		);
		this.progressTrackEl = progressContainer.createDiv(
			"sync-progress-track",
		);
		this.progressTrackEl.setAttribute("role", "progressbar");
		this.progressTrackEl.setAttribute("aria-label", this.title);
		this.progressTrackEl.setAttribute("aria-valuemin", "0");
		this.progressTrackEl.setAttribute(
			"aria-valuemax",
			String(Math.max(1, this.totalSessions)),
		);
		this.progressTrackEl.setAttribute("aria-valuenow", "0");
		this.progressTrackEl.setAttribute(
			"aria-valuetext",
			`0 of ${this.totalSessions} sessions`,
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
		this.currentFileEl.setText(this.initialCurrentFile);

		if (this.showGeneratedTags) {
			const generatedTagsSection = contentEl.createDiv(
				"sync-generated-tags-section",
			);
			const generatedTagsHeading = generatedTagsSection.createDiv(
				"sync-generated-tags-heading",
			);
			generatedTagsHeading.createEl("h4", { text: "Generated tags" });
			this.generatedTagsCountEl = generatedTagsHeading.createSpan(
				"sync-generated-tags-count",
			);
			this.generatedTagsCountEl.setText("0 tags");
			this.generatedTagsContainer = generatedTagsSection.createDiv(
				"sync-generated-tags-list",
			);
			this.generatedTagsContainer.setAttribute("role", "list");
			this.generatedTagsContainer.setAttribute(
				"aria-label",
				"Recently generated tags by session",
			);
			this.generatedTagsEmptyEl = this.generatedTagsContainer.createDiv(
				"sync-generated-tags-empty",
			);
			this.generatedTagsEmptyEl.setText(
				"Tags will appear here as sessions finish.",
			);
			this.generatedTagsLiveRegionEl = generatedTagsSection.createEl(
				"span",
				{ cls: "sync-generated-tags-live" },
			);
			this.generatedTagsLiveRegionEl.setAttribute("role", "status");
			this.generatedTagsLiveRegionEl.setAttribute("aria-live", "polite");
			this.generatedTagsLiveRegionEl.setAttribute("aria-atomic", "true");
		}

		// Log section
		const logSection = contentEl.createDiv("sync-log-section");
		logSection.createEl("h4", { text: "Activity Log" });
		this.logContainer = logSection.createDiv("sync-log-container");
		this.summaryEl = contentEl.createDiv("sync-summary");
		this.summaryEl.setText(this.initialSummary);

		// Buttons
		const btnRow = contentEl.createDiv("sync-btn-row");
		this.cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		this.cancelBtn.addEventListener("click", () => {
			if (this.cancellationRequested) return;
			this.cancellationRequested = true;
			this.onCancel?.();
			this.cancelBtn.setText("Cancelling…");
			this.cancelBtn.setAttribute("disabled", "true");
		});

		this.backgroundBtn = btnRow.createEl("button", {
			text: this.backgroundButtonLabel,
		});
		if (!this.showBackgroundButton) {
			this.backgroundBtn.addClass("sync-btn-hidden");
		}
		this.backgroundBtn.addEventListener("click", () => {
			this.leavingInBackground = true;
			this.close();
		});

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

		window.setTimeout(() => this.updateElapsed(), 1000);
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

	updateStatus(status: string): void {
		this.statusEl?.setText(status);
	}

	updateSummary(summary: string): void {
		this.summaryEl?.setText(summary);
	}

	addGeneratedTags(sessionTitle: string, tags: string[]): void {
		if (!this.generatedTagsContainer) return;
		const visibleTags = tags.map((tag) => tag.trim()).filter(Boolean);
		if (visibleTags.length === 0) return;

		this.generatedTagTotal += visibleTags.length;
		this.generatedSessionTotal++;
		this.generatedTagGroups.push({ sessionTitle, tags: visibleTags });
		if (this.generatedTagGroups.length > 4) {
			this.generatedTagGroups.shift();
		}
		this.generatedTagsCountEl?.setText(
			`${this.generatedTagTotal} tag${this.generatedTagTotal === 1 ? "" : "s"} · ${this.generatedSessionTotal} session${this.generatedSessionTotal === 1 ? "" : "s"}`,
		);
		this.generatedTagsEmptyEl?.remove();
		this.generatedTagsEmptyEl = undefined;
		this.generatedTagsContainer.empty();
		for (const groupData of this.generatedTagGroups) {
			const group = this.generatedTagsContainer.createDiv(
				"sync-generated-tag-group",
			);
			group.setAttribute("role", "listitem");
			group
				.createDiv("sync-generated-tag-session")
				.setText(groupData.sessionTitle);
			const tagList = group.createDiv("sync-generated-tag-pills");
			tagList.setAttribute("role", "list");
			for (const tag of groupData.tags) {
				const tagPill = tagList.createSpan("chat-session-tag");
				tagPill.setAttribute("role", "listitem");
				tagPill.setText(tag);
			}
		}
		this.generatedTagsContainer.scrollTop =
			this.generatedTagsContainer.scrollHeight;
		this.generatedTagsLiveRegionEl?.setText(
			`Generated tags for ${sessionTitle}: ${visibleTags.join(", ")}. ${this.generatedTagTotal} tags across ${this.generatedSessionTotal} sessions so far.`,
		);
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
		this.progressTrackEl?.setAttribute(
			"aria-valuemax",
			String(Math.max(1, this.totalSessions)),
		);
		this.progressTrackEl?.setAttribute("aria-valuenow", String(completed));
		this.progressTrackEl?.setAttribute(
			"aria-valuetext",
			`${completed} of ${this.totalSessions} sessions`,
		);

		if (this.percentEl) {
			this.percentEl.setText(`${percent}%`);
		}

		this.updateSessionCount();
	}

	/** Apply live engine progress to the visible modal, including counters. */
	updateFromSnapshot(snapshot: SyncProgressSnapshot): void {
		if (this.phase !== "progress") return;
		this.setTotal(snapshot.total);
		this.updateProgress(snapshot.completed);
		this.statusEl?.setText(snapshot.stage);
		this.currentFileEl?.setText(snapshot.stage);
		this.summaryEl?.setText(
			`⏱ ${(snapshot.elapsedMs / 1000).toFixed(1)}s · ↑${snapshot.uploaded} ↓${snapshot.downloaded} ⚡${snapshot.conflicts} ⌫${snapshot.deleted ?? 0} ⊘${snapshot.skipped}`,
		);
	}

	onComplete(result: SyncResult): void {
		this.finishWithSummary(
			result.status === "failed"
				? "⚠️ Sync Finished with Errors"
				: "✅ Sync Complete",
			result.message ?? "",
			`⏱ ${((Date.now() - this.startTime) / 1000).toFixed(1)}s · ↑${result.uploaded} ↓${result.downloaded} ⚡${result.conflicts} ⌫${result.deleted ?? 0} ⊘${result.skipped}`,
		);
		this.updateProgress(this.totalSessions);
	}

	finishWithSummary(title: string, message: string, summary: string): void {
		this.isComplete = true;
		this.cancelBtn?.addClass("sync-btn-hidden");
		this.backgroundBtn?.addClass("sync-btn-hidden");
		this.doneBtn?.removeClass("sync-btn-hidden");
		this.contentEl
			.querySelector<HTMLElement>(".sync-header-title")
			?.setText(title);
		this.statusEl?.setText(message);
		this.currentFileEl?.setText("");
		this.summaryEl?.setText(summary);
	}

	finish(result: SyncResult): void {
		this.onComplete(result);
	}
}
