import { Modal, App } from "obsidian";
import type { SyncResult } from "../sync/StorageAdapter";

interface LogEntry {
	time: number;
	icon: string;
	text: string;
	done?: boolean;
	error?: boolean;
}

export class SyncProgressModal extends Modal {
	private onCancel?: () => void;
	private startTime: number;
	private totalSessions = 0;
	private completedCount = 0;
	private logEntries: LogEntry[] = [];

	// DOM refs
	private headerEl!: HTMLElement;
	private progressFillEl!: HTMLElement;
	private progressTextEl!: HTMLElement;
	private logEl!: HTMLElement;
	private summaryEl!: HTMLElement;
	private cancelBtn!: HTMLElement;
	private backgroundBtn!: HTMLElement;
	private doneBtn!: HTMLElement;
	private isDone = false;

	constructor(
		app: App,
		totalSessions: number,
		options?: { onCancel?: () => void },
	) {
		super(app);
		this.startTime = Date.now();
		this.totalSessions = totalSessions;
		this.onCancel = options?.onCancel;
	}

	/** Update total session count after plan is computed */
	setTotal(total: number) {
		this.totalSessions = total;
		this.progressTextEl.setText(`0/${this.totalSessions} (0%)`);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sync-progress-modal");

		// Header with progress
		this.headerEl = contentEl.createDiv("sync-header");

		const title = this.headerEl.createEl("span", "sync-header-title");
		title.setText(`🔄 Syncing ${this.totalSessions} sessions`);

		this.progressTextEl = this.headerEl.createEl("span", "sync-header-progress");
		this.progressTextEl.setText(`0/${this.totalSessions}`);

		// Progress bar
		const progressContainer = contentEl.createDiv("sync-progress-bar");

		this.progressFillEl = progressContainer.createDiv("sync-progress-fill");
		this.progressFillEl.setCssProps({ "--sync-progress-width": "0%" });

		// Log container (terminal style)
		this.logEl = contentEl.createDiv("sync-log");

		// Summary line
		this.summaryEl = contentEl.createDiv("sync-summary");
		this.summaryEl.setText("⏱️ Starting...");

		// Buttons
		const btnRow = contentEl.createDiv("sync-btn-row");

		this.cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		this.cancelBtn.addEventListener("click", () => {
			this.onCancel?.();
			this.cancelBtn.setText("Cancelling...");
			(this.cancelBtn as HTMLButtonElement).disabled = true;
		});

		this.backgroundBtn = btnRow.createEl("button", {
			text: "Background",
		});
		this.backgroundBtn.addEventListener("click", () => {
			this.close();
		});

		this.doneBtn = btnRow.createEl("button", { text: "Done" });
		this.doneBtn.addClass("sync-btn-hidden");
		this.doneBtn.addEventListener("click", () => {
			this.close();
		});

		this.addLog("system", "Starting sync...");
	}

	/** Add a log entry. Auto-updates progress if it's a session operation. */
	addLog(
		type: "upload" | "download" | "conflict" | "skip" | "error" | "system",
		message: string,
		meta?: { id?: string; done?: boolean; error?: boolean },
	) {
		const icons: Record<string, string> = {
			upload: "↑",
			download: "↓",
			conflict: "⚡",
			skip: "⊘",
			error: "✗",
			system: "•",
		};

		const entry: LogEntry = {
			time: Date.now(),
			icon: icons[type] || "•",
			text: message,
			done: meta?.done,
			error: meta?.error,
		};
		this.logEntries.push(entry);

		// Render the entry
		const line = this.logEl.createDiv("sync-log-line");
		if (meta?.done) line.addClass("is-done");
		if (meta?.error) line.addClass("is-error");

		const icon = line.createEl("span", "sync-log-icon");
		icon.setText(entry.icon);

		const text = line.createEl("span", "sync-log-text");
		text.setText(message);

		if (meta?.done) {
			const done = line.createEl("span", "sync-log-done");
			done.setText("✓");
		}

		// Auto-scroll
		this.logEl.scrollTop = this.logEl.scrollHeight;

		// Update progress for every completed transfer, including plugin data.
		if (type !== "system" && type !== "error" && meta?.done) {
			this.completedCount++;
			this.updateProgress();
		}
	}

	updateProgress() {
		const pct =
			this.totalSessions > 0
				? Math.round((this.completedCount / this.totalSessions) * 100)
				: 0;
		this.progressTextEl.setText(
			`${this.completedCount}/${this.totalSessions} (${pct}%)`,
		);
		this.progressFillEl.setCssProps({ "--sync-progress-width": `${pct}%` });
		this.updateSummary();
	}

	updateSummary() {
		const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
		this.summaryEl.setText(
			`⏱️ ${elapsed}s elapsed  ·  ${this.completedCount} done`,
		);
	}

	finish(result: SyncResult & { message: string }) {
		this.isDone = true;
		const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

		this.headerEl.empty();
		const title = this.headerEl.createEl("span", "sync-header-title");
		const ok = result.errors.length === 0;
		title.setText(ok ? "✅ Sync complete" : "⚠️ Sync finished with errors");
		if (!ok) title.addClass("is-error");

		this.progressTextEl.setText(result.message);
		this.progressFillEl.setCssProps({ "--sync-progress-width": "100%" });

		this.addLog("system", `Done in ${elapsed}s — ${result.message}`);

		if (result.errors.length > 0) {
			this.addLog("error", `${result.errors.length} error(s):`);
			for (const err of result.errors.slice(0, 5)) {
				this.addLog("error", `  ${err}`);
			}
			if (result.errors.length > 5) {
				this.addLog(
					"system",
					`  ... and ${result.errors.length - 5} more`,
				);
			}
		}

		this.summaryEl.setText(
			`⏱️ ${elapsed}s  ·  ↑${result.uploaded} ↓${result.downloaded} ⚡${result.conflicts} ⊘${result.skipped}`,
		);

		// Swap buttons
		this.cancelBtn.addClass("sync-btn-hidden");
		this.backgroundBtn.addClass("sync-btn-hidden");
		this.doneBtn.removeClass("sync-btn-hidden");
	}

	onClose() {
		this.contentEl.empty();
	}
}
