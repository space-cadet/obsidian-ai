import { App, Notice, Setting } from "obsidian";
import { checkDataHealth, type HealthReport } from "../diagnostics/dataHealth";

export function renderDataHealth(
	container: HTMLElement,
	app: App,
	pluginId: string,
): void {
	let report: HealthReport | undefined;
	const status = container.createEl("p", {
		text: "Check saved data without changing it. Pause chat and sync for the most consistent results.",
		cls: "setting-item-description",
	});
	status.setAttribute("role", "status");
	status.setAttribute("aria-live", "polite");
	const details = container.createEl("details");
	details.createEl("summary", { text: "Data health findings" });
	const output = details.createDiv();
	output.classList.add("chat-lab-health-findings");
	output.tabIndex = 0;
	output.setAttribute("role", "region");
	output.setAttribute("aria-label", "Data health findings");
	let exportButton: import("obsidian").ButtonComponent;
	new Setting(container)
		.setName("Check data health")
		.setDesc(
			"Inspect plugin assets, settings, session indexes and transcripts, attachment drafts, and saved AI memory. No automatic repairs.",
		)
		.addButton((btn) =>
			btn.setButtonText("Run check").onClick(async () => {
				btn.setDisabled(true);
				exportButton.setDisabled(true);
				report = undefined;
				output.empty();
				status.textContent = "Checking saved data…";
				try {
					report = await checkDataHealth(
						app.vault.adapter,
						`${app.vault.configDir}/plugins/${pluginId}`,
						pluginId,
						(count) => {
							status.textContent = `Checking saved data… ${count} files read.`;
						},
					);
					const { counts } = report;
					status.textContent = `${report.filesChecked} data files read. ${counts.error} errors, ${counts.warning} warnings, ${counts.info} notes; ${report.filesSkipped} files skipped. ${counts.error || counts.warning || report.filesSkipped ? "Review findings below." : "No issues found within the checks performed."}`;
					for (const finding of report.findings) {
						const row = output.createDiv();
						row.createEl("p", {
							text: `${finding.severity.toUpperCase()}: ${finding.message}`,
						});
						row.createEl("p", {
							text: `${finding.path}${finding.line ? ` (line ${finding.line})` : ""}`,
							cls: "setting-item-description",
						}).setCssStyles({ overflowWrap: "anywhere" });
						row.createEl("p", {
							text: finding.suggestion,
							cls: "setting-item-description",
						});
					}
					if (report.omittedFindings)
						output.createEl("p", {
							text: `${report.omittedFindings} additional findings omitted; totals above include them.`,
						});
					for (const limitation of report.limitations)
						output.createEl("p", {
							text: limitation,
							cls: "setting-item-description",
						});
					details.open = true;
					exportButton.setDisabled(false);
				} catch {
					status.textContent =
						"Check could not finish. No files were changed. Check storage access and try again.";
				} finally {
					btn.setDisabled(false);
				}
			}),
		)
		.addButton((btn) => {
			exportButton = btn;
			btn.setButtonText("Export report")
				.setDisabled(true)
				.onClick(async () => {
					if (!report) return;
					btn.setDisabled(true);
					try {
						const filename = `chat-lab-health-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
						await app.vault.create(
							filename,
							JSON.stringify(report, null, 2),
						);
						new Notice(`Health report saved to ${filename}`);
					} catch {
						new Notice(
							"Could not save health report. Check vault write access and try again.",
						);
					} finally {
						btn.setDisabled(false);
					}
				});
		});
}
