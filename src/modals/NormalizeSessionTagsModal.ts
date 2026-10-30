import { App, ButtonComponent, Modal } from "obsidian";
import type ObsidianAIPlugin from "../main";
import { SessionStateOwner } from "../state/SessionStateOwner";
import {
	affectedTagSessions,
	applyTagMerges,
	canonicalTag,
	collectSessionTags,
	suggestLocalTagMerges,
	suggestRelatedTagMerges,
	validateTagMerges,
	TagNormalizationSaveError,
	type TagInventory,
	type TagMerge,
} from "../lib/sessionTagNormalization";

export class NormalizeSessionTagsModal extends Modal {
	private owner: SessionStateOwner;
	private inventory: TagInventory | null = null;
	private merges: TagMerge[] = [];
	private hasProposals = false;
	private tab: "suggested" | "all" = "suggested";
	private controller: AbortController | null = null;
	private busy = false;
	private pendingSave = false;
	private closed = false;
	private status = "";
	private summaryEl!: HTMLElement;
	private feedbackEl!: HTMLElement;
	private applyButton!: ButtonComponent;
	constructor(
		app: App,
		private readonly plugin: ObsidianAIPlugin,
	) {
		super(app);
		this.owner = plugin.sessionState ??= new SessionStateOwner({
			load: () => plugin.loadChatData(),
			hydrate: (id) => plugin.hydrateSession(id),
			save: (data) => plugin.saveChatData(data),
		});
	}
	onOpen(): void {
		this.closed = false;
		this.modalEl.addClass("session-tag-normalization-modal");
		this.titleEl.setText("Normalize tags");
		void this.scan();
	}
	private async scan(): Promise<void> {
		this.controller?.abort();
		this.controller = null;
		this.busy = true;
		this.status = "Loading saved tags…";
		this.render();
		try {
			await this.owner.initialize();
			if (this.closed) return;
			this.inventory = collectSessionTags(
				this.owner.getSnapshot().sessions,
			);
			this.merges = suggestLocalTagMerges(this.inventory).map((row) => ({
				...row,
				selected: false,
			}));
			this.hasProposals = false;
			this.status = "";
		} catch (error) {
			this.status = `Could not scan tags: ${String(error)}`;
		} finally {
			this.busy = false;
			if (!this.closed) this.render();
		}
	}
	private render(): void {
		this.contentEl.empty();
		const review = this.contentEl.createDiv({
			cls: "tag-normalization-review",
		});
		review.createEl("p", {
			text: "Consolidate existing tags across saved chats. Review every change before applying.",
		});
		const inventory = this.inventory;
		if (inventory)
			review.createEl("p", {
				cls: "tag-normalization-muted",
				text: `${inventory.tags.size} unique tags · ${inventory.sessionCount} saved sessions`,
			});
		const profile = this.plugin.settings.providerProfiles.find(
			(item) => item.id === this.plugin.settings.sessionTaggingProfileId,
		);
		const related = review.createDiv({
			cls: "tag-normalization-related",
		});
		new ButtonComponent(related)
			.setButtonText(
				this.hasProposals
					? "Regenerate proposals"
					: "Find merge proposals",
			)
			.setCta()
			.setDisabled(
				this.busy ||
					this.pendingSave ||
					!profile ||
					!inventory?.tags.size,
			)
			.onClick(() => {
				void this.suggest();
			});
		related.createSpan({
			cls: "tag-normalization-muted",
			text: profile
				? `Uses ${profile.name || profile.provider} / ${profile.model}. Clicking sends tag names only. Review and select the proposed merges.`
				: "Choose a session tag provider in Settings to suggest equivalent terms.",
		});
		const tabs = review.createDiv({
			cls: "tag-normalization-tabs",
		});
		tabs.setAttribute("aria-label", "Tag view");
		const suggested = this.hasProposals
			? this.merges.filter((row) => row.sources.length > 1)
			: [];
		for (const [value, label] of [
			["suggested", `Suggested merges (${suggested.length})`],
			["all", `All tags (${inventory?.tags.size ?? 0})`],
		] as const) {
			const button = new ButtonComponent(tabs)
				.setButtonText(label)
				.setDisabled(this.busy)
				.onClick(() => {
					this.tab = value;
					this.render();
				});
			button.buttonEl.setAttribute(
				"aria-pressed",
				String(this.tab === value),
			);
			if (this.tab === value) button.setCta();
		}
		const table = review.createDiv({
			cls: "tag-normalization-table",
		});
		const header = table.createDiv({
			cls: "tag-normalization-row tag-normalization-header",
		});
		for (const text of [
			"Use",
			"Existing tags",
			"Canonical tag",
			"Sessions",
		])
			header.createSpan({ text });
		const rows = this.tab === "suggested" ? suggested : this.merges;
		if (!rows.length)
			table.createEl("p", {
				cls: "tag-normalization-empty",
				text: inventory?.tags.size
					? this.hasProposals
						? "No equivalent groups proposed. Review All tags or regenerate proposals."
						: "Choose Find merge proposals to group equivalent tags with AI. Use All tags for individual spelling edits."
					: "No saved session tags found.",
			});
		for (const row of rows) {
			const el = table.createDiv({ cls: "tag-normalization-row" });
			const use = el.createEl("label", { cls: "tag-normalization-use" });
			const checkbox = use.createEl("input", { type: "checkbox" });
			checkbox.checked = row.selected;
			checkbox.disabled = this.busy || this.pendingSave;
			checkbox.setAttribute(
				"aria-label",
				`Apply merge for ${row.sources.join(", ")}`,
			);
			const sources = el.createDiv({ cls: "tag-normalization-sources" });
			row.sources.forEach((source) =>
				sources.createSpan({
					cls: "tag-normalization-chip",
					text: source,
				}),
			);
			const target = el.createEl("label", {
				cls: "tag-normalization-target",
			});
			target.createSpan({
				cls: "tag-normalization-target-label",
				text: "Merge into",
			});
			const input = target.createEl("input", {
				type: "text",
				value: row.target,
			});
			input.disabled = this.busy || this.pendingSave;
			input.maxLength = 32;
			input.setAttribute(
				"aria-label",
				`Canonical tag for ${row.sources.join(", ")}`,
			);
			const count = affectedTagSessions(inventory!, [
				{ ...row, selected: true },
			]);
			el.createSpan({
				cls: "tag-normalization-session-count",
				text: String(count),
			});
			checkbox.addEventListener("change", () => {
				row.selected = checkbox.checked;
				this.updateSummary();
			});
			input.addEventListener("input", () => {
				row.target = input.value;
				row.selected = true;
				checkbox.checked = true;
				this.updateSummary();
			});
			input.addEventListener("blur", () => {
				row.target = canonicalTag(input.value);
				input.value = row.target;
				this.updateSummary();
			});
		}
		review.createEl("p", {
			cls: "tag-normalization-muted",
			text: "Edit canonical names and select the groups to apply. Merges replace labels across saved sessions and remove duplicates.",
		});
		const controls = this.contentEl.createDiv({
			cls: "tag-normalization-controls",
		});
		this.summaryEl = controls.createDiv({
			cls: "tag-normalization-summary",
		});
		this.summaryEl.setAttribute("role", "status");
		this.feedbackEl = controls.createDiv({
			cls: "tag-normalization-feedback",
		});
		this.feedbackEl.setAttribute("role", "status");
		const footer = controls.createDiv({
			cls: "tag-normalization-footer",
		});
		new ButtonComponent(footer)
			.setButtonText(this.pendingSave ? "Retry save" : "Rescan tags")
			.setDisabled(this.busy)
			.onClick(() => {
				void (this.pendingSave ? this.retrySave() : this.scan());
			});
		new ButtonComponent(footer)
			.setButtonText(this.controller ? "Cancel suggestions" : "Cancel")
			.setDisabled(this.busy && !this.controller)
			.onClick(() => this.close());
		this.applyButton = new ButtonComponent(footer).setCta().onClick(() => {
			void this.apply();
		});
		this.updateSummary();
	}
	private updateSummary(): void {
		const selected = this.merges.filter((row) => row.selected);
		const count = this.inventory
			? affectedTagSessions(this.inventory, selected)
			: 0;
		this.summaryEl.setText(
			`${selected.length} selected · ${count} sessions affected`,
		);
		let validation = "";
		try {
			if (this.inventory) validateTagMerges(this.merges, this.inventory);
		} catch (error) {
			validation = error instanceof Error ? error.message : String(error);
		}
		const feedback = validation || this.status;
		this.feedbackEl.setText(feedback);
		this.feedbackEl.tabIndex = feedback ? 0 : -1;
		this.feedbackEl.toggleAttribute("hidden", !feedback);
		const applyLabel = selected.length
			? `Apply ${selected.length} merges`
			: "No merges selected";
		this.applyButton
			.setButtonText(applyLabel)
			.setDisabled(
				this.busy ||
					this.pendingSave ||
					!selected.length ||
					count === 0 ||
					Boolean(validation),
			);
	}
	private async suggest(): Promise<void> {
		const profile = this.plugin.settings.providerProfiles.find(
			(item) => item.id === this.plugin.settings.sessionTaggingProfileId,
		);
		if (!profile || !this.inventory) return;
		this.controller = new AbortController();
		const controller = this.controller;
		this.busy = true;
		this.status = "Finding equivalent tag names…";
		this.render();
		try {
			const rows = await suggestRelatedTagMerges(
				this.inventory,
				profile,
				this.plugin.chatapi,
				controller.signal,
			);
			if (this.closed || controller.signal.aborted) return;
			this.merges = rows.map((row) => ({ ...row, selected: false }));
			this.hasProposals = true;
			this.tab = "suggested";
			this.status = "Suggestions ready. Select merges to apply.";
		} catch (error) {
			if (!controller.signal.aborted)
				this.status = `Could not find proposals: ${error instanceof Error ? error.message : String(error)}. Try Find merge proposals again.`;
		} finally {
			this.busy = false;
			this.controller = null;
			if (!this.closed) this.render();
		}
	}
	private async apply(): Promise<void> {
		if (!this.inventory || this.busy) return;
		this.busy = true;
		this.status = "Saving normalized session tags…";
		this.render();
		try {
			const count = await applyTagMerges(
				this.owner,
				this.inventory,
				this.merges,
			);
			this.inventory = collectSessionTags(
				this.owner.getSnapshot().sessions,
			);
			this.merges = suggestLocalTagMerges(this.inventory).map((row) => ({
				...row,
				selected: false,
			}));
			this.hasProposals = false;
			this.status = `Normalization saved. Updated ${count} sessions.`;
		} catch (error) {
			this.pendingSave = error instanceof TagNormalizationSaveError;
			this.status = this.pendingSave
				? `${String(error)}. Choose Retry save to persist the pending metadata changes.`
				: String(error);
		} finally {
			this.busy = false;
			if (!this.closed) this.render();
		}
	}
	private async retrySave(): Promise<void> {
		this.busy = true;
		this.status = "Saving pending tag changes…";
		this.render();
		try {
			await this.owner.flush();
			this.pendingSave = false;
			this.inventory = collectSessionTags(
				this.owner.getSnapshot().sessions,
			);
			this.merges = suggestLocalTagMerges(this.inventory).map((row) => ({
				...row,
				selected: false,
			}));
			this.hasProposals = false;
			this.status = "Normalized tags saved.";
		} catch (error) {
			this.status = `Could not save tags: ${String(error)}. Choose Retry save.`;
		} finally {
			this.busy = false;
			if (!this.closed) this.render();
		}
	}

	close(): void {
		if (this.busy && !this.controller) return;
		super.close();
	}
	onClose(): void {
		this.closed = true;
		this.controller?.abort();
		this.contentEl.empty();
	}
}
