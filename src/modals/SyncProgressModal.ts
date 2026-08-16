import { Modal, App, Setting, Notice } from "obsidian";
import type { SyncResult } from "../sync/StorageAdapter";

export class SyncProgressModal extends Modal {
	private onCancel?: () => void;
	private resultEl: HTMLElement | null = null;
	private spinnerEl: HTMLElement | null = null;
	private countsEl: HTMLElement | null = null;
	private cancelBtn: HTMLElement | null = null;
	private backgroundBtn: HTMLElement | null = null;
	private doneBtn: HTMLElement | null = null;
	private isDone = false;

	constructor(app: App, options?: { onCancel?: () => void }) {
		super(app);
		this.onCancel = options?.onCancel;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Syncing Sessions" });

		// Spinner
		this.spinnerEl = contentEl.createDiv("sync-spinner");
		this.spinnerEl.setText("⏳ Sync in progress...");

		// Counts
		this.countsEl = contentEl.createDiv("sync-counts");
		this.countsEl.setText("Starting...");
		this.countsEl.style.marginTop = "1em";
		this.countsEl.style.color = "var(--text-muted)";

		// Result area (hidden until done)
		this.resultEl = contentEl.createDiv("sync-result");
		this.resultEl.style.marginTop = "1em";
		this.resultEl.style.display = "none";

		// Buttons
		const btnRow = contentEl.createDiv("sync-btn-row");
		btnRow.style.marginTop = "1.5em";
		btnRow.style.display = "flex";
		btnRow.style.gap = "0.5em";
		btnRow.style.justifyContent = "flex-end";

		this.cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		this.cancelBtn.addEventListener("click", () => {
			this.onCancel?.();
			this.close();
		});

		this.backgroundBtn = btnRow.createEl("button", { text: "Background" });
		this.backgroundBtn.addEventListener("click", () => {
			this.close();
		});

		this.doneBtn = btnRow.createEl("button", { text: "Done" });
		this.doneBtn.style.display = "none";
		this.doneBtn.addEventListener("click", () => {
			this.close();
		});
	}

	updateProgress(label: string) {
		if (this.countsEl) {
			this.countsEl.setText(label);
		}
	}

	finish(result: SyncResult & { message: string }) {
		this.isDone = true;

		if (this.spinnerEl) {
			this.spinnerEl.setText("✅ Sync complete");
		}

		if (this.countsEl) {
			this.countsEl.setText(result.message);
			this.countsEl.style.color = result.errors.length > 0
				? "var(--text-error)"
				: "var(--text-success)";
		}

		if (this.resultEl) {
			this.resultEl.style.display = "block";
			if (result.errors.length > 0) {
				this.resultEl.createEl("div", {
					text: `⚠️ ${result.errors.length} error(s)`,
					cls: "sync-error-count",
				});
				const details = this.resultEl.createEl("details");
				details.createEl("summary", { text: "Error details" });
				for (const err of result.errors) {
					details.createEl("div", {
						text: err,
						cls: "sync-error-detail",
					});
				}
			}
		}

		// Swap buttons
		if (this.cancelBtn) this.cancelBtn.style.display = "none";
		if (this.backgroundBtn) this.backgroundBtn.style.display = "none";
		if (this.doneBtn) this.doneBtn.style.display = "inline-block";
	}

	onClose() {
		this.contentEl.empty();
	}
}
