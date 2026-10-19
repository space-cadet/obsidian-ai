import { App, Modal, Notice } from "obsidian";
import {
	cancelDataRepair,
	previewDataRepair,
	scheduleDataRepair,
	type RepairAdapter,
	type RepairPlan,
} from "../diagnostics/dataRepair";
import type { FileLogger } from "../logger";

const REQUEST_FILE = "health-repair-request.json";
const RUNNING_FILE = "health-repair-running.json";
const RESULT_FILE = "health-repair-result.json";

/** Review chat-data repairs and schedule the approved plan for the next load. */
export class DataRepairModal extends Modal {
	private readonly root: string;
	private readonly adapter: RepairAdapter;
	private readonly logger?: Pick<FileLogger, "log">;
	private statusEl!: HTMLElement;
	private progressContainer!: HTMLElement;
	private progressTrack!: HTMLElement;
	private progressFill!: HTMLElement;
	private progressPercent!: HTMLElement;
	private previewEl!: HTMLElement;
	private actionButton!: HTMLButtonElement;
	private secondaryButton!: HTMLButtonElement;
	private plan?: RepairPlan;
	private readonly selectedRecoveryPaths = new Set<string>();
	private busy = false;
	private scheduled = false;
	private interrupted = false;
	private lastResultMessage?: string;
	private readonly previewStartedAt = Date.now();

	constructor(app: App, pluginId: string, logger?: Pick<FileLogger, "log">) {
		super(app);
		this.root = `${app.vault.configDir}/plugins/${pluginId}`;
		this.adapter = app.vault.adapter as unknown as RepairAdapter;
		this.logger = logger;
	}

	onOpen(): void {
		this.modalEl.addClass("chat-lab-data-repair-modal");
		this.contentEl.empty();
		this.contentEl.createEl("h2", { text: "Review chat repairs" });
		this.contentEl.createEl("p", {
			text: "Review the proposed changes before scheduling them.",
			cls: "setting-item-description",
		});

		const warning = this.contentEl.createDiv("chat-lab-repair-warning");
		warning.setAttribute("role", "note");
		warning.createEl("strong", {
			text: "Pause sync on all devices.",
		});
		warning.createSpan({
			text: " Repairs run after Obsidian restarts.",
		});

		this.statusEl = this.contentEl.createEl("p", {
			text: "Preparing a read-only repair preview…",
			cls: "setting-item-description",
		});
		this.statusEl.setAttribute("role", "status");
		this.statusEl.setAttribute("aria-live", "polite");
		this.progressContainer = this.contentEl.createDiv(
			"chat-lab-repair-progress-container",
		);
		this.progressTrack = this.progressContainer.createDiv(
			"chat-lab-repair-progress-track",
		);
		this.progressTrack.setAttribute("role", "progressbar");
		this.progressTrack.setAttribute("aria-label", "Repair scan progress");
		this.progressTrack.setAttribute("aria-valuemin", "0");
		this.progressFill = this.progressTrack.createDiv(
			"chat-lab-repair-progress-fill is-indeterminate",
		);
		this.progressPercent = this.progressContainer.createEl("span", {
			text: "Preparing…",
			cls: "chat-lab-repair-progress-percent",
		});
		this.logger?.log("debug", "[DataRepair] Preview started");
		this.previewEl = this.contentEl.createDiv(
			"chat-lab-repair-preview chat-lab-health-findings",
		);
		this.previewEl.setAttribute("role", "region");
		this.previewEl.setAttribute("aria-label", "Chat repair preview");
		this.previewEl.tabIndex = 0;
		this.previewEl.hidden = true;

		const footer = this.contentEl.createDiv("chat-lab-repair-footer");
		this.secondaryButton = footer.createEl("button", {
			text: "Cancel",
		});
		this.secondaryButton.addEventListener("click", () => {
			if (this.scheduled) void this.cancelScheduled();
			else this.close();
		});
		this.actionButton = footer.createEl("button", {
			text: "Schedule repairs",
			cls: "mod-cta",
		});
		this.actionButton.disabled = true;
		this.actionButton.addEventListener("click", () => {
			if (this.scheduled) this.close();
			else void this.schedule();
		});
		void this.loadPreview();
	}

	onClose(): void {
		this.contentEl.empty();
		this.modalEl.removeClass("chat-lab-data-repair-modal");
	}

	private async loadPreview(): Promise<void> {
		this.busy = true;
		this.actionButton.disabled = true;
		try {
			if (await this.adapter.exists(`${this.root}/${RUNNING_FILE}`)) {
				this.interrupted = true;
				this.statusEl.textContent =
					"A previous repair was interrupted. Automatic repairs are paused; use the saved backup for manual recovery.";
			} else if (
				await this.adapter.exists(`${this.root}/${REQUEST_FILE}`)
			) {
				this.scheduled = true;
				this.setScheduledState();
			} else if (
				await this.adapter.exists(`${this.root}/${RESULT_FILE}`)
			) {
				try {
					const result = JSON.parse(
						await this.adapter.read(`${this.root}/${RESULT_FILE}`),
					);
					if (typeof result.message === "string")
						this.lastResultMessage = result.message;
				} catch {
					// A stale or unreadable result does not block a new preview.
				}
			}
			this.plan = await previewDataRepair(
				this.adapter,
				this.root,
				({ phase, completed, total }) => {
					this.statusEl.textContent = `${phase}: ${completed} of ${total}`;
					const percent = Math.round((completed / total) * 100);
					this.progressFill.removeClass("is-indeterminate");
					this.progressFill.setCssProps({ width: `${percent}%` });
					this.progressPercent.textContent = `${percent}%`;
					this.progressTrack.setAttribute(
						"aria-valuemax",
						String(total),
					);
					this.progressTrack.setAttribute(
						"aria-valuenow",
						String(completed),
					);
				},
			);
			this.progressContainer.hidden = true;
			this.renderPreview();
			this.logger?.log(
				"info",
				`[DataRepair] Preview complete: ${this.plan.safeRepairCount} repair operation(s), ${this.plan.recoverableChats.length} recoverable chat(s), ${this.plan.skipped.length + this.plan.omittedSkipped} manual-review finding(s), ${Date.now() - this.previewStartedAt}ms`,
			);
			if (this.scheduled) this.setScheduledState();
			else if (this.interrupted)
				this.statusEl.textContent =
					"A previous repair was interrupted. Automatic repairs are paused; use the saved backup for manual recovery.";
			else if (this.lastResultMessage)
				this.statusEl.textContent = this.lastResultMessage;
		} catch {
			this.progressContainer.hidden = true;
			this.logger?.log("error", "[DataRepair] Preview failed");
			this.statusEl.textContent =
				"Could not prepare the preview. No chat files were changed. Check storage access and try again.";
			this.previewEl.empty();
		} finally {
			this.busy = false;
			this.updateAction();
		}
	}

	private renderPreview(): void {
		const plan = this.plan;
		if (!plan) return;
		this.previewEl.empty();
		this.previewEl.hidden = false;
		this.selectedRecoveryPaths.clear();

		const safe = this.previewEl.createDiv("chat-lab-repair-section");
		safe.createEl("h3", {
			text: `Safe repairs · ${plan.safeRepairCount}`,
		});
		if (plan.changes.length === 0) {
			safe.createEl("p", {
				text: "No automatic chat repairs are available.",
				cls: "setting-item-description",
			});
		} else {
			for (const change of plan.changes) {
				const row = safe.createDiv("chat-lab-repair-row");
				row.createEl("p", { text: change.description });
				row.createEl("p", {
					text: change.path,
					cls: "setting-item-description",
				});
			}
		}

		const recover = this.previewEl.createDiv("chat-lab-repair-section");
		recover.createEl("h3", {
			text: `Recover unindexed chats · ${plan.recoverableChats.length}`,
		});
		if (plan.recoverableChats.length === 0) {
			recover.createEl("p", {
				text: "No valid unindexed chats are ready to recover.",
				cls: "setting-item-description",
			});
		} else {
			recover.createEl("p", {
				text: "Select each chat you want to add to chat history.",
				cls: "setting-item-description",
			});
			for (const chat of plan.recoverableChats) {
				const row = recover.createDiv("chat-lab-repair-recovery");
				const checkbox = row.createEl("input", { type: "checkbox" });
				checkbox.setAttribute("aria-label", `Recover ${chat.title}`);
				checkbox.addEventListener("change", () => {
					if (checkbox.checked)
						this.selectedRecoveryPaths.add(chat.path);
					else this.selectedRecoveryPaths.delete(chat.path);
					this.updateAction();
				});
				const label = row.createDiv();
				label.createEl("strong", { text: chat.title });
				label.createEl("span", {
					text: `${chat.messageCount} messages${chat.duplicateCount ? ` · ${chat.duplicateCount} identical duplicates removed` : ""}`,
					cls: "setting-item-description",
				});
				label.createEl("span", {
					text: chat.path,
					cls: "setting-item-description",
				});
			}
		}

		const review = this.previewEl.createEl("details", {
			cls: "chat-lab-repair-section chat-lab-repair-review",
		});
		review.createEl("summary", {
			text: `Needs manual review · ${plan.skipped.length + plan.omittedSkipped}`,
		});
		review.createEl("p", {
			text: "Each entry gives the reason that file was skipped. Skipped files stay unchanged.",
			cls: "setting-item-description",
		});
		for (const skipped of plan.skipped.slice(0, 100)) {
			const row = review.createDiv("chat-lab-repair-row");
			row.createEl("p", { text: skipped.reason });
			row.createEl("p", {
				text: skipped.path,
				cls: "setting-item-description",
			});
		}
		if (plan.omittedSkipped || plan.skipped.length > 100)
			review.createEl("p", {
				text: "Additional findings are omitted from this preview; rerun the health check for the complete report.",
				cls: "setting-item-description",
			});

		this.previewEl.createEl("p", {
			text: "Verified originals are backed up in the plugin’s health-backups folder before any chat file changes.",
			cls: "setting-item-description chat-lab-repair-backup-note",
		});
		this.statusEl.textContent =
			"Review the proposed changes. Unindexed chats remain untouched unless you select them.";
	}

	private updateAction(): void {
		if (this.scheduled) {
			this.actionButton.textContent = "Done";
			this.actionButton.disabled = false;
			return;
		}
		if (this.interrupted || this.busy || !this.plan) {
			this.actionButton.disabled = true;
			return;
		}
		const selectedRecoveries = this.plan.recoverableChats.filter((chat) =>
			this.selectedRecoveryPaths.has(chat.path),
		);
		const count =
			this.plan.safeRepairCount +
			selectedRecoveries.length +
			selectedRecoveries.reduce(
				(total, chat) => total + chat.duplicateCount,
				0,
			);
		this.actionButton.textContent = count
			? `Schedule ${count} repairs`
			: "No repairs selected";
		this.actionButton.disabled = count === 0;
	}

	private async schedule(): Promise<void> {
		if (!this.plan || this.busy || this.interrupted) return;
		this.busy = true;
		this.updateAction();
		this.secondaryButton.disabled = true;
		this.statusEl.textContent =
			"Checking the preview and scheduling repairs…";
		try {
			const recoveryCount = this.selectedRecoveryPaths.size;
			const operationCount =
				this.plan.safeRepairCount +
				this.plan.recoverableChats
					.filter((chat) => this.selectedRecoveryPaths.has(chat.path))
					.reduce(
						(count, chat) => count + 1 + chat.duplicateCount,
						0,
					);
			await scheduleDataRepair(this.adapter, this.root, this.plan, [
				...this.selectedRecoveryPaths,
			]);
			this.logger?.log(
				"info",
				`[DataRepair] Repair scheduled: ${operationCount} operation(s), ${recoveryCount} chat recovery choice(s)`,
			);
			this.scheduled = true;
			this.statusEl.textContent =
				"Repairs are scheduled. Pause sync on all devices, then reload Obsidian to apply them. No chat files have changed yet.";
			this.setScheduledState();
			new Notice(
				"Chat repairs scheduled. Reload Obsidian to apply them.",
			);
		} catch (error) {
			this.logger?.log("error", "[DataRepair] Scheduling failed", error);
			this.statusEl.textContent =
				error instanceof Error
					? error.message
					: "Could not schedule repairs. Preview again.";
		} finally {
			this.busy = false;
			this.secondaryButton.disabled = false;
			this.updateAction();
		}
	}

	private setScheduledState(): void {
		this.secondaryButton.textContent = "Cancel scheduled repair";
		this.actionButton.textContent = "Done";
		this.actionButton.disabled = false;
		this.statusEl.textContent =
			"Repairs are scheduled. Pause sync on all devices, then reload Obsidian to apply them. No chat files have changed yet.";
	}

	private async cancelScheduled(): Promise<void> {
		this.secondaryButton.disabled = true;
		try {
			await cancelDataRepair(this.adapter, this.root);
			this.logger?.log("info", "[DataRepair] Scheduled repair cancelled");
			this.scheduled = false;
			this.close();
		} catch (error) {
			this.logger?.log(
				"error",
				"[DataRepair] Cancellation failed",
				error,
			);
			this.statusEl.textContent =
				"Could not cancel the scheduled repair. Check storage access before reloading.";
			this.secondaryButton.disabled = false;
		}
	}
}
