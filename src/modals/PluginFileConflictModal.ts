import { App, Modal, Setting } from "obsidian";
import type {
	PluginFileSyncConflict,
	PluginFileConflictChoice,
} from "../sync/PluginFileSyncManager";

function preview(value: string | null): string {
	if (value === null) return "(deleted or unavailable)";
	return value.length > 8000 ? `${value.slice(0, 8000)}\n…` : value;
}

/** Ask for an explicit choice before changing a conflicting plugin file. */
export class PluginFileConflictModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly conflict: PluginFileSyncConflict,
		private readonly finish: (choice: PluginFileConflictChoice) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: `Plugin data conflict: ${this.conflict.target.id}`,
		});
		contentEl.createEl("p", {
			text: this.conflict.unknownRemoteDisappearance
				? "The remote item disappeared without a recorded deletion. Choose deliberately; it will not be treated as an automatic deletion."
				: "This item changed on both sides since the last shared state.",
		});

		const values = contentEl.createDiv("plugin-file-conflict-values");
		const local = values.createDiv();
		local.createEl("h3", { text: "Local" });
		local.createEl("pre", { text: preview(this.conflict.localContent) });
		const remote = values.createDiv();
		remote.createEl("h3", { text: "Remote" });
		remote.createEl("pre", { text: preview(this.conflict.remoteContent) });

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText("Use local")
					.onClick(() => this.choose("local")),
			)
			.addButton((button) =>
				button
					.setButtonText("Use remote")
					.onClick(() => this.choose("remote")),
			)
			.addButton((button) =>
				button
					.setButtonText("Keep both")
					.onClick(() => this.choose("both")),
			)
			.addButton((button) =>
				button
					.setButtonText("Cancel")
					.onClick(() => this.choose("cancel")),
			);
	}

	onClose(): void {
		if (!this.settled) this.choose("cancel", false);
	}

	private choose(choice: PluginFileConflictChoice, close = true): void {
		if (this.settled) return;
		this.settled = true;
		this.finish(choice);
		if (close) this.close();
	}
}

export function requestPluginFileConflictChoice(
	app: App,
	conflict: PluginFileSyncConflict,
): Promise<PluginFileConflictChoice> {
	return new Promise((resolve) => {
		new PluginFileConflictModal(app, conflict, resolve).open();
	});
}
