import type { ToolResult } from "../../types";
import {
	sanitizeSettings,
	validateSettingUpdate,
	resolveSettingPath,
} from "../../../lib/selfSettingsTools";
import {
	ToolHandlerBase,
	type ToolHandlerContext,
} from "../ToolHandlerContext";

/** Read and update plugin settings through the guarded settings tools. */
export class SettingsHandlers extends ToolHandlerBase {
	constructor(context: ToolHandlerContext) {
		super(context);
	}

	async readSettings(): Promise<ToolResult> {
		if (!this.settings) {
			return { error: "Settings are not available." };
		}
		return {
			success: true,
			settings: sanitizeSettings(this.settings),
		};
	}

	async updateSetting(args: {
		key: string;
		value: unknown;
	}): Promise<ToolResult> {
		if (!this.settings) {
			return { error: "Settings are not available." };
		}

		// Server-side developerMode gate (T61 security requirement)
		if (!this.settings.developerMode) {
			return {
				error: "Developer mode is disabled. Enable it in Settings → Advanced to allow the AI to modify settings.",
			};
		}

		const validation = validateSettingUpdate(args.key, args.value);
		if (!validation.ok) {
			return { error: validation.error };
		}

		// Resolve nested path for assignment
		const resolved = resolveSettingPath(this.settings, args.key);
		if (!resolved) {
			return { error: `Failed to resolve path "${args.key}" in settings.` };
		}

		// Apply the update
		resolved.parent[resolved.key] = validation.value;

		// Persist
		if (this.saveSettings) {
			try {
				await this.saveSettings();
			} catch (e: any) {
				return {
					error: `Failed to save settings: ${e.message || String(e)}`,
				};
			}
		}

		// Audit log
		await this._auditSettingChange(validation.key, validation.value);

		return {
			success: true,
			key: validation.key,
			value: validation.value,
		};
	}

	private async _auditSettingChange(
		key: string,
		value: unknown,
	): Promise<void> {
		const adapter = this.app.vault.adapter;
		const auditPath = `${this.app.vault.configDir}/plugins/obsidian-ai/settings-audit.jsonl`;
		const entry = {
			timestamp: new Date().toISOString(),
			operation: "update_setting",
			key,
			value:
				typeof value === "boolean" || typeof value === "number"
					? value
					: String(value),
		};
		const line = JSON.stringify(entry) + "\n";
		try {
			if (await adapter.exists(auditPath)) {
				const existing = await adapter.read(auditPath);
				await adapter.write(auditPath, existing + line);
			} else {
				await adapter.write(auditPath, line);
			}
		} catch {
			// Silently fail audit logging — it's non-critical
		}
	}
}
