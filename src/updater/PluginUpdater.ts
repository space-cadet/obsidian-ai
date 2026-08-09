import { App, Notice, Modal, ButtonComponent, Setting } from "obsidian";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

export interface ReleaseInfo {
	tag_name: string;
	name: string;
	body: string;
	prerelease: boolean;
	published_at: string;
	html_url: string;
	assets: Array<{
		name: string;
		browser_download_url: string;
		size: number;
	}>;
}

export interface UpdateCheckResult {
	hasUpdate: boolean;
	currentVersion: string;
	latestVersion: string;
	release: ReleaseInfo | null;
	isPrerelease: boolean;
}

const GITHUB_REPO = "space-cadet/obsidian-ai";
const RELEASE_FILES = ["main.js", "manifest.json", "styles.css"];

/** Simple semver comparison: returns >0 if v1 > v2, <0 if v1 < v2, 0 if equal */
function compareVersions(v1: string, v2: string): number {
	const a = v1.replace(/^v/, "").split(".").map(Number);
	const b = v2.replace(/^v/, "").split(".").map(Number);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const av = a[i] || 0;
		const bv = b[i] || 0;
		if (av !== bv) return av - bv;
	}
	return 0;
}

function httpsGetJson(url: string): Promise<any> {
	return new Promise((resolve, reject) => {
		https
			.get(url, { headers: { "User-Agent": "obsidian-ai-updater" } }, (res) => {
				if (res.statusCode === 302 && res.headers.location) {
					httpsGetJson(res.headers.location).then(resolve).catch(reject);
					return;
				}
				if (res.statusCode !== 200) {
					reject(new Error(`HTTP ${res.statusCode}: ${url}`));
					return;
				}
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					try {
						resolve(JSON.parse(data));
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", reject);
	});
}

function httpsDownload(url: string, destPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(destPath);
		https
			.get(url, { headers: { "User-Agent": "obsidian-ai-updater" } }, (res) => {
				if (res.statusCode === 302 && res.headers.location) {
					file.close();
					fs.unlinkSync(destPath);
					httpsDownload(res.headers.location, destPath).then(resolve).catch(reject);
					return;
				}
				if (res.statusCode !== 200) {
					file.close();
					reject(new Error(`HTTP ${res.statusCode}: ${url}`));
					return;
				}
				res.pipe(file);
				file.on("finish", () => {
					file.close();
					resolve();
				});
			})
			.on("error", (err) => {
				file.close();
				if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
				reject(err);
			});
	});
}

export class PluginUpdater {
	private app: App;
	private pluginDir: string;

	constructor(app: App, pluginId: string) {
		this.app = app;
		// Obsidian plugins live at <vault>/.obsidian/plugins/<plugin-id>/
		const basePath = (this.app.vault.adapter as any).basePath ?? "";
		this.pluginDir = path.join(basePath, ".obsidian", "plugins", pluginId);
	}

	/** Check if an update is available */
	async checkForUpdate(
		currentVersion: string,
		includePrerelease: boolean,
	): Promise<UpdateCheckResult> {
		try {
			let release: ReleaseInfo;

			if (includePrerelease) {
				// Fetch all releases and find the latest (including prereleases)
				const releases = (await httpsGetJson(
					`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`,
				)) as ReleaseInfo[];
				if (!releases || releases.length === 0) {
					return { hasUpdate: false, currentVersion, latestVersion: currentVersion, release: null, isPrerelease: false };
				}
				release = releases[0]; // GitHub returns releases sorted by date, newest first
			} else {
				release = await httpsGetJson(
					`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
				);
			}

			const latestVersion = release.tag_name.replace(/^v/, "");
			const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

			return {
				hasUpdate,
				currentVersion,
				latestVersion,
				release,
				isPrerelease: release.prerelease,
			};
		} catch (error) {
			console.error("[PluginUpdater] Check failed:", error);
			return { hasUpdate: false, currentVersion, latestVersion: currentVersion, release: null, isPrerelease: false };
		}
	}

	/** Download update files to a temp directory */
	async downloadUpdate(release: ReleaseInfo): Promise<string> {
		const tempDir = path.join(this.pluginDir, ".update-tmp");
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}

		// Clean temp dir
		for (const f of fs.readdirSync(tempDir)) {
			fs.unlinkSync(path.join(tempDir, f));
		}

		// Download each required file
		for (const filename of RELEASE_FILES) {
			const asset = release.assets.find((a) => a.name === filename);
			if (!asset) {
				throw new Error(`Release missing required file: ${filename}`);
			}
			const destPath = path.join(tempDir, filename);
			await httpsDownload(asset.browser_download_url, destPath);
		}

		return tempDir;
	}

	/** Install downloaded update files */
	async installUpdate(tempDir: string): Promise<void> {
		// Backup current files
		const backupDir = path.join(this.pluginDir, ".backup");
		if (!fs.existsSync(backupDir)) {
			fs.mkdirSync(backupDir, { recursive: true });
		}

		for (const filename of RELEASE_FILES) {
			const currentPath = path.join(this.pluginDir, filename);
			const backupPath = path.join(backupDir, filename);
			if (fs.existsSync(currentPath)) {
				fs.copyFileSync(currentPath, backupPath);
			}
		}

		// Copy new files
		for (const filename of RELEASE_FILES) {
			const src = path.join(tempDir, filename);
			const dest = path.join(this.pluginDir, filename);
			fs.copyFileSync(src, dest);
		}

		// Clean up temp dir
		for (const f of fs.readdirSync(tempDir)) {
			fs.unlinkSync(path.join(tempDir, f));
		}
		fs.rmdirSync(tempDir);
	}

	/** Rollback to backup files */
	async rollback(): Promise<void> {
		const backupDir = path.join(this.pluginDir, ".backup");
		if (!fs.existsSync(backupDir)) {
			throw new Error("No backup available for rollback");
		}

		for (const filename of RELEASE_FILES) {
			const backupPath = path.join(backupDir, filename);
			const dest = path.join(this.pluginDir, filename);
			if (fs.existsSync(backupPath)) {
				fs.copyFileSync(backupPath, dest);
			}
		}
	}
}

/** Modal shown when an update is available */
export class UpdateAvailableModal extends Modal {
	private result: "install" | "skip" | null = null;

	constructor(
		app: App,
		private checkResult: UpdateCheckResult,
		private onInstall: () => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Update Available" });

		const info = contentEl.createDiv();
		info.createEl("p", {
			text: `Current version: ${this.checkResult.currentVersion}`,
		});
		info.createEl("p", {
			text: `Latest version: ${this.checkResult.latestVersion}`,
		});

		if (this.checkResult.isPrerelease) {
			info.createEl("p", {
				text: "⚠️ This is a pre-release (dev build).",
				cls: "updater-prerelease-warning",
			});
		}

		if (this.checkResult.release?.body) {
			contentEl.createEl("h3", { text: "Changelog" });
			const changelog = contentEl.createDiv("updater-changelog");
			changelog.createEl("pre", { text: this.checkResult.release.body });
		}

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Install & Reload")
					.setCta()
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText("Installing…");
						try {
							await this.onInstall();
							this.result = "install";
							this.close();
							new Notice("✅ Update installed. Reloading Obsidian…");
							// @ts-ignore
							this.app.commands.executeCommandById("app:reload");
						} catch (error: any) {
							btn.setButtonText("Install & Reload");
							btn.setDisabled(false);
							new Notice(`❌ Update failed: ${error.message}`);
						}
					}),
			)
			.addButton((btn) =>
				btn.setButtonText("Skip").onClick(() => {
					this.result = "skip";
					this.close();
				}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}

	async awaitChoice(): Promise<"install" | "skip"> {
		return new Promise((resolve) => {
			const check = () => {
				if (this.result !== null) {
					resolve(this.result);
				} else {
					setTimeout(check, 50);
				}
			};
			check();
		});
	}
}
