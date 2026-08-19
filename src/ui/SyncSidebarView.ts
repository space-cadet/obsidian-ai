import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type ObsidianAIPlugin from "../main";
import type { SyncResult, SyncPlan } from "../sync/StorageAdapter";

export const SYNC_SIDEBAR_VIEW_TYPE = "obsidian-ai-sync-sidebar";

interface LogEntry {
	time: number;
	icon: string;
	text: string;
	done?: boolean;
	error?: boolean;
}

export class SyncSidebarView extends ItemView {
	private plugin: ObsidianAIPlugin;

	// ── DOM refs ──
	private headerEl!: HTMLElement;
	private statusBadgeEl!: HTMLElement;
	private statusTextEl!: HTMLElement;
	private lastSyncEl!: HTMLElement;
	private progressSection!: HTMLElement;
	private progressFillEl!: HTMLElement;
	private progressTextEl!: HTMLElement;
	private statsEl!: HTMLElement;
	private logEl!: HTMLElement;
	private btnRow!: HTMLElement;
	private syncBtn!: HTMLElement;
	private cancelBtn!: HTMLElement;
	private settingsBtn!: HTMLElement;
	private clearLogBtn!: HTMLElement;

	// ── State ──
	private isSyncing = false;
	private startTime = 0;
	private totalOps = 0;
	private completedCount = 0;
	private logEntries: LogEntry[] = [];
	private statValues = {
		uploaded: 0,
		downloaded: 0,
		conflicts: 0,
		skipped: 0,
	};

	constructor(leaf: WorkspaceLeaf, plugin: ObsidianAIPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return SYNC_SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Chat Sync";
	}

	getIcon(): string {
		return "sync";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("obsidian-ai-sync-sidebar");
		container.style.display = "flex";
		container.style.flexDirection = "column";
		container.style.height = "100%";
		container.style.minWidth = "0";
		container.style.overflowX = "hidden";

		// ── Header ──
		const headerSection = container.createDiv("obsidian-ai-sync-header");
		headerSection.style.padding = "12px 16px";
		headerSection.style.borderBottom = "1px solid var(--background-modifier-border)";
		headerSection.style.display = "flex";
		headerSection.style.justifyContent = "space-between";
		headerSection.style.alignItems = "center";

		this.headerEl = headerSection.createEl("div");
		this.headerEl.style.fontWeight = "600";
		this.headerEl.style.fontSize = "1.1em";
		this.headerEl.setText("Chat Sync");

		this.statusBadgeEl = headerSection.createEl("span");
		this.statusBadgeEl.style.fontSize = "0.75em";
		this.statusBadgeEl.style.padding = "2px 8px";
		this.statusBadgeEl.style.borderRadius = "10px";
		this.statusBadgeEl.style.fontWeight = "600";
		this._setStatusBadge("idle");

		// ── Status row ──
		const statusSection = container.createDiv("obsidian-ai-sync-status");
		statusSection.style.padding = "8px 16px";
		statusSection.style.borderBottom = "1px solid var(--background-modifier-border)";

		this.statusTextEl = statusSection.createEl("div");
		this.statusTextEl.style.fontSize = "0.9em";
		this.statusTextEl.setText("Ready");

		this.lastSyncEl = statusSection.createEl("div");
		this.lastSyncEl.style.fontSize = "0.8em";
		this.lastSyncEl.style.color = "var(--text-muted)";
		this.lastSyncEl.style.marginTop = "4px";
		this._updateLastSyncText();

		// ── Progress section ──
		this.progressSection = container.createDiv("obsidian-ai-sync-progress");
		this.progressSection.style.padding = "12px 16px";
		this.progressSection.style.borderBottom = "1px solid var(--background-modifier-border)";
		this.progressSection.style.display = "none";

		const progressContainer = this.progressSection.createDiv();
		progressContainer.style.height = "6px";
		progressContainer.style.background = "var(--background-modifier-border)";
		progressContainer.style.borderRadius = "3px";
		progressContainer.style.marginBottom = "6px";
		progressContainer.style.overflow = "hidden";

		this.progressFillEl = progressContainer.createDiv();
		this.progressFillEl.style.height = "100%";
		this.progressFillEl.style.width = "0%";
		this.progressFillEl.style.background = "var(--interactive-accent)";
		this.progressFillEl.style.transition = "width 0.2s ease";
		this.progressFillEl.style.borderRadius = "3px";

		this.progressTextEl = this.progressSection.createEl("div");
		this.progressTextEl.style.fontSize = "0.8em";
		this.progressTextEl.style.color = "var(--text-muted)";
		this.progressTextEl.setText("0%");

		// ── Stats counters ──
		this.statsEl = container.createDiv("obsidian-ai-sync-stats");
		this.statsEl.style.display = "flex";
		this.statsEl.style.justifyContent = "space-around";
		this.statsEl.style.gap = "4px";
		this.statsEl.style.padding = "10px 16px";
		this.statsEl.style.borderBottom = "1px solid var(--background-modifier-border)";
		this.statsEl.style.flexWrap = "wrap";

		const statDefs = [
			{ key: "uploaded", label: "↑ uploaded", color: "var(--text-success)" },
			{ key: "downloaded", label: "↓ downloaded", color: "var(--text-accent)" },
			{ key: "conflicts", label: "⚡ conflicts", color: "var(--text-warning)" },
			{ key: "skipped", label: "⊘ skipped", color: "var(--text-muted)" },
		] as const;

		for (const def of statDefs) {
			const card = this.statsEl.createDiv();
			card.style.textAlign = "center";
			card.style.flex = "1";
			card.style.minWidth = "50px";
			card.dataset.statKey = def.key;

			const valueEl = card.createEl("div");
			valueEl.style.fontSize = "1.1em";
			valueEl.style.fontWeight = "700";
			valueEl.style.color = def.color;
			valueEl.setText("0");

			const labelEl = card.createEl("div");
			labelEl.style.fontSize = "0.65em";
			labelEl.style.color = "var(--text-faint)";
			labelEl.setText(def.label);
		}

		// ── Log area ──
		const logSection = container.createDiv("obsidian-ai-sync-log-section");
		logSection.style.flex = "1";
		logSection.style.display = "flex";
		logSection.style.flexDirection = "column";
		logSection.style.overflow = "hidden";
		logSection.style.minHeight = "120px";

		const logHeader = logSection.createDiv();
		logHeader.style.display = "flex";
		logHeader.style.justifyContent = "space-between";
		logHeader.style.alignItems = "center";
		logHeader.style.padding = "8px 16px";
		logHeader.style.borderBottom = "1px solid var(--background-modifier-border)";

		const logTitle = logHeader.createEl("span");
		logTitle.style.fontSize = "0.85em";
		logTitle.style.fontWeight = "600";
		logTitle.setText("Activity Log");

		this.clearLogBtn = logHeader.createEl("button", { text: "Clear" });
		this.clearLogBtn.style.fontSize = "0.75em";
		this.clearLogBtn.style.padding = "2px 8px";
		this.clearLogBtn.addEventListener("click", () => this._clearLog());

		this.logEl = logSection.createDiv("obsidian-ai-sync-log");
		this.logEl.style.flex = "1";
		this.logEl.style.overflowY = "auto";
		this.logEl.style.fontFamily = "var(--font-monospace)";
		this.logEl.style.fontSize = "0.8em";
		this.logEl.style.lineHeight = "1.6";
		this.logEl.style.padding = "8px 16px";
		this.logEl.style.background = "var(--background-primary-alt)";

		// ── Action buttons ──
		const actionsSection = container.createDiv("obsidian-ai-sync-actions");
		actionsSection.style.padding = "12px 16px";
		actionsSection.style.borderTop = "1px solid var(--background-modifier-border)";
		actionsSection.style.display = "flex";
		actionsSection.style.gap = "8px";
		actionsSection.style.flexWrap = "wrap";

		this.syncBtn = actionsSection.createEl("button", { text: "Sync Now" });
		this.syncBtn.style.flex = "1";
		this.syncBtn.addClass("mod-cta");
		this.syncBtn.addEventListener("click", () => {
			void this.plugin.triggerSync();
		});

		this.cancelBtn = actionsSection.createEl("button", { text: "Cancel" });
		this.cancelBtn.style.flex = "1";
		this.cancelBtn.addClass("mod-warning");
		this.cancelBtn.style.display = "none";
		this.cancelBtn.addEventListener("click", () => {
			this.plugin.syncEngine?.cancel();
			this.addLog("system", "Cancellation requested...");
		});

		this.settingsBtn = actionsSection.createEl("button", { text: "Settings" });
		this.settingsBtn.style.flex = "1";
		this.settingsBtn.addEventListener("click", () => this._openSettings());

		this._restoreState();
	}

	// ═══════════════════════════════════════
	//  Public API
	// ═══════════════════════════════════════

	/** Called when a sync plan is computed and sync is about to start. */
	setPlan(plan: SyncPlan) {
		this.isSyncing = true;
		this.startTime = Date.now();
		this.totalOps = plan.upload.length + plan.download.length + plan.conflicts.length;
		this.completedCount = 0;
		this.statValues = { uploaded: 0, downloaded: 0, conflicts: 0, skipped: plan.skipped };
		this._setStatusBadge("syncing");
		this.statusTextEl.setText("Syncing...");
		this.statusTextEl.style.color = "var(--interactive-accent)";
		this.lastSyncEl.setText(
			`Plan: ↑${plan.upload.length} ↓${plan.download.length} ⚡${plan.conflicts.length} ⊘${plan.skipped}`,
		);
		this.progressSection.style.display = "block";
		this.syncBtn.style.display = "none";
		this.cancelBtn.style.display = "block";
		this._updateProgressBar();
		this._updateStats();
		this._clearLog();
		this.addLog("system", `Starting sync — ${this.totalOps} operations`);
	}

	/** Update progress for a single operation. */
	updateProgress(
		current: number,
		total: number,
		operation: "upload" | "download" | "conflict" | "skip" | "error",
		sessionTitle?: string,
	) {
		this.completedCount = current;
		this.totalOps = total;
		this._updateProgressBar();

		if (operation === "upload") this.statValues.uploaded++;
		else if (operation === "download") this.statValues.downloaded++;
		else if (operation === "conflict") this.statValues.conflicts++;
		else if (operation === "skip") this.statValues.skipped++;

		this._updateStats();
		this._updateElapsed();
	}

	/** Add a log entry to the live log. */
	addLog(
		type: "upload" | "download" | "conflict" | "skip" | "error" | "system",
		message: string,
		meta?: { done?: boolean; error?: boolean },
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

		const line = this.logEl.createDiv("sync-log-line");
		line.style.display = "flex";
		line.style.gap = "6px";
		line.style.opacity = meta?.done ? "0.6" : "1";
		if (meta?.error) line.style.color = "var(--text-error)";

		const icon = line.createEl("span");
		icon.style.minWidth = "1em";
		icon.setText(entry.icon);

		const text = line.createEl("span");
		text.style.flex = "1";
		text.style.wordBreak = "break-word";
		text.setText(message);

		if (meta?.done) {
			const done = line.createEl("span");
			done.setText("✓");
			done.style.color = "var(--text-success)";
		}

		// Keep last 100 lines
		while (this.logEl.children.length > 100) {
			this.logEl.firstChild?.remove();
		}
		this.logEl.scrollTop = this.logEl.scrollHeight;
	}

	/** Mark sync as finished. */
	finish(result: SyncResult & { message: string }) {
		this.isSyncing = false;
		const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
		const ok = result.errors.length === 0;

		this._setStatusBadge(ok ? "complete" : "error");
		this.statusTextEl.setText(ok ? "Sync complete" : "Sync finished with errors");
		this.statusTextEl.style.color = ok ? "var(--text-success)" : "var(--text-error)";
		this.lastSyncEl.setText(`${result.message} · ${elapsed}s`);

		this.progressSection.style.display = "none";
		this.syncBtn.style.display = "block";
		this.cancelBtn.style.display = "none";

		this.addLog("system", `Done in ${elapsed}s — ${result.message}`);
		if (result.errors.length > 0) {
			for (const err of result.errors.slice(0, 5)) {
				this.addLog("error", err);
			}
			if (result.errors.length > 5) {
				this.addLog("system", `... and ${result.errors.length - 5} more errors`);
			}
		}
	}

	/** Mark sync as cancelled. */
	setCancelled() {
		this.isSyncing = false;
		this._setStatusBadge("idle");
		this.statusTextEl.setText("Cancelled");
		this.statusTextEl.style.color = "var(--text-warning)";
		this.progressSection.style.display = "none";
		this.syncBtn.style.display = "block";
		this.cancelBtn.style.display = "none";
		this.addLog("system", "Sync cancelled by user");
	}

	/** Mark sync as failed. */
	setError(message: string) {
		this.isSyncing = false;
		this._setStatusBadge("error");
		this.statusTextEl.setText("Sync failed");
		this.statusTextEl.style.color = "var(--text-error)";
		this.lastSyncEl.setText(message);
		this.progressSection.style.display = "none";
		this.syncBtn.style.display = "block";
		this.cancelBtn.style.display = "none";
		this.addLog("error", message);
	}

	/** Update idle status text (e.g. last sync time). */
	updateIdleStatus(text: string) {
		if (!this.isSyncing) {
			this.statusTextEl.setText("Ready");
			this.statusTextEl.style.color = "";
			this.lastSyncEl.setText(text);
		}
	}

	// ═══════════════════════════════════════
	//  Private helpers
	// ═══════════════════════════════════════

	private _setStatusBadge(status: "idle" | "syncing" | "complete" | "error") {
		const styles: Record<typeof status, { text: string; bg: string; color: string }> = {
			idle: { text: "idle", bg: "var(--background-modifier-border)", color: "var(--text-muted)" },
			syncing: { text: "syncing", bg: "var(--interactive-accent)", color: "var(--text-on-accent)" },
			complete: { text: "complete", bg: "rgba(var(--color-green-rgb), 0.2)", color: "var(--color-green)" },
			error: { text: "error", bg: "rgba(var(--color-red-rgb), 0.15)", color: "var(--color-red)" },
		};
		const s = styles[status];
		this.statusBadgeEl.setText(s.text);
		this.statusBadgeEl.style.background = s.bg;
		this.statusBadgeEl.style.color = s.color;
	}

	private _updateLastSyncText() {
		const last = this.plugin.settings.remoteStorage.lastSyncTime;
		if (last) {
			const ago = Math.round((Date.now() - last) / 60000);
			const timeStr = ago < 1 ? "just now" : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
			this.lastSyncEl.setText(`Last sync: ${timeStr}`);
		} else {
			this.lastSyncEl.setText("Never synced");
		}
	}

	private _updateProgressBar() {
		const pct = this.totalOps > 0 ? Math.round((this.completedCount / this.totalOps) * 100) : 0;
		this.progressFillEl.style.width = `${pct}%`;
		this.progressTextEl.setText(`${this.completedCount}/${this.totalOps} (${pct}%)`);
	}

	private _updateStats() {
		const map: Record<string, number> = {
			uploaded: this.statValues.uploaded,
			downloaded: this.statValues.downloaded,
			conflicts: this.statValues.conflicts,
			skipped: this.statValues.skipped,
		};
		for (const card of Array.from(this.statsEl.children)) {
			const key = (card as HTMLElement).dataset.statKey;
			if (!key) continue;
			const valueEl = card.querySelector("div:first-child") as HTMLElement;
			if (valueEl) valueEl.setText(String(map[key] ?? 0));
		}
	}

	private _updateElapsed() {
		const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
		this.lastSyncEl.setText(`${this.completedCount} done · ${elapsed}s elapsed`);
	}

	private _clearLog() {
		this.logEl.empty();
		this.logEntries = [];
	}

	private _openSettings() {
		// @ts-ignore
		this.app.setting.open();
		// @ts-ignore
		this.app.setting.openTabById(this.plugin.manifest.id);
	}

	private _restoreState() {
		// Reset UI to idle state on open
		this._setStatusBadge("idle");
		this._updateLastSyncText();
		this._updateStats();
	}
}
