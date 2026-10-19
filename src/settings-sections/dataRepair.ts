import { App, Setting } from "obsidian";
import {
	previewDataRepair,
	scheduleDataRepair,
	cancelDataRepair,
	type RepairPlan,
} from "../diagnostics/dataRepair";

export function renderDataRepair(
	container: HTMLElement,
	app: App,
	pluginId: string,
): void {
	const root = `${app.vault.configDir}/plugins/${pluginId}`;
	let plan: RepairPlan | undefined;
	let busy = false;
	let revision = 0;
	const status = container.createEl("p", {
		text: "Repairs run on the next plugin load, before chats and sync start. Pause sync on all devices before previewing and keep it paused until repair finishes.",
		cls: "setting-item-description",
	});
	status.setAttribute("role", "status");
	status.setAttribute("aria-live", "polite");
	const details = container.createEl("details");
	details.createEl("summary", { text: "Repair preview and skipped files" });
	const output = details.createDiv();
	output.classList.add("chat-lab-health-findings");
	output.tabIndex = 0;
	output.setAttribute("role", "region");
	output.setAttribute("aria-label", "Repair preview");
	let apply: import("obsidian").ButtonComponent;
	let cancel: import("obsidian").ButtonComponent;
	new Setting(container)
		.setName("Repair data")
		.setDesc(
			"Remove identical duplicate messages or memories, correct verified counts, and clear stale tab references. Originals are backed up and verified first. Conflicting, malformed, oversized, and unindexed files are left alone.",
		)
		.addButton((btn) =>
			btn.setButtonText("Preview repairs").onClick(async () => {
				if (busy) return;
				busy = true;
				revision++;
				btn.setDisabled(true);
				apply.setDisabled(true);
				cancel.setDisabled(true);
				plan = undefined;
				output.empty();
				status.textContent = "Preparing a read-only repair preview…";
				try {
					plan = await previewDataRepair(app.vault.adapter, root);
					status.textContent = `${plan.changes.length} file(s) can be repaired; ${plan.skipped.length + (plan.omittedSkipped ?? 0)} file(s) skipped. Review the preview, then schedule repairs and restart Obsidian. Files that change after approval will not be repaired.`;
					for (const change of plan.changes) {
						output.createEl("p", { text: change.description });
						output.createEl("p", {
							text: change.path,
							cls: "setting-item-description",
						});
					}
					for (const skip of plan.skipped)
						output.createEl("p", {
							text: `Skipped: ${skip.path} — ${skip.reason}`,
							cls: "setting-item-description",
						});
					if (plan.omittedSkipped)
						output.createEl("p", {
							text: `${plan.omittedSkipped} additional skipped files omitted from this preview.`,
						});
					output.createEl("p", {
						text: "Unindexed transcripts, conflicting duplicates, cross-tier memory conflicts, malformed files, and files over 8 MiB need separate review. This preview never deletes them. Backups stay in the plugin’s health-backups folder and may contain private data.",
						cls: "setting-item-description",
					});
					details.open = true;
					apply.setDisabled(plan.changes.length === 0);
				} catch {
					status.textContent =
						"Could not prepare repairs. No data files changed. Check storage access and try again.";
				} finally {
					busy = false;
					btn.setDisabled(false);
					cancel.setDisabled(false);
				}
			}),
		)
		.addButton((btn) => {
			apply = btn;
			btn.setButtonText("Schedule repairs")
				.setDisabled(true)
				.onClick(async () => {
					if (!plan) return;
					if (busy) return;
					busy = true;
					revision++;
					btn.setDisabled(true);
					cancel.setDisabled(true);
					try {
						await scheduleDataRepair(app.vault.adapter, root, plan);
						status.textContent =
							"Repairs scheduled. Keep sync paused and restart Obsidian. A verified backup will be created before data changes. You can cancel before restarting.";
						plan = undefined;
					} catch (error) {
						status.textContent =
							error instanceof Error
								? error.message
								: "Could not schedule repairs. Preview again.";
						plan = undefined;
					} finally {
						busy = false;
						cancel.setDisabled(false);
					}
				});
		})
		.addButton((btn) => {
			cancel = btn;
			btn.setButtonText("Cancel scheduled repairs").onClick(async () => {
				if (busy) return;
				busy = true;
				revision++;
				btn.setDisabled(true);
				apply.setDisabled(true);
				plan = undefined;
				try {
					await cancelDataRepair(app.vault.adapter, root);
					status.textContent =
						"Scheduled repairs cancelled. No data files changed.";
				} catch {
					status.textContent =
						"Could not cancel repairs. Check storage access before restarting Obsidian.";
				} finally {
					busy = false;
					btn.setDisabled(false);
				}
			});
		});
	// Show the persistent outcome after restart without loading or mutating data.
	void (async () => {
		try {
			if (
				await app.vault.adapter.exists(
					`${root}/health-repair-request.json`,
				)
			) {
				if (revision === 0)
					status.textContent =
						"Repairs are scheduled for the next plugin load. Keep sync paused; restart Obsidian or cancel below.";
			} else if (
				await app.vault.adapter.exists(
					`${root}/health-repair-result.json`,
				)
			) {
				const stat = await app.vault.adapter.stat(
					`${root}/health-repair-result.json`,
				);
				if (!stat || stat.size > 1024 * 1024) return;
				const result = JSON.parse(
					await app.vault.adapter.read(
						`${root}/health-repair-result.json`,
					),
				);
				if (revision === 0 && typeof result.message === "string")
					status.textContent = result.message;
			}
		} catch {
			/* The action controls remain available when status cannot be read. */
		}
	})();
}
