import type { ToolResult } from "../../types";
import {
	sanitizeSettings,
	validateSettingUpdate,
	resolveSettingPath,
} from "../../../lib/selfSettingsTools";
import { DEFAULT_AGENT_PROMPT } from "../../../defaultAgentPrompt";
import {
	ToolHandlerBase,
	type LatestSystemPromptSnapshot,
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
		const settings = sanitizeSettings(this.settings);
		delete settings.agentPrompt;
		return {
			success: true,
			settings,
			currentTurn: this.currentTurnModelContext
				? {
						profileId: this.currentTurnModelContext.profileId,
						provider: this.currentTurnModelContext.provider,
						profileName: this.currentTurnModelContext.profileName,
						configuredModel: this.currentTurnModelContext.model,
						thinkingMode: this.currentTurnModelContext.thinkingMode,
						thinkingModeRequest:
							this.currentTurnModelContext.provider === "agent"
								? "not sent by this plugin"
								: this.currentTurnModelContext.thinkingMode ===
									  "provider-default"
									? "provider default; no override requested"
									: "requested from provider; effective behavior is not confirmed",
					}
				: null,
			currentTurnNote:
				"currentTurn describes this chat turn's configured request. The global active profile in settings is only the default and may differ. Provider or remote-agent routing can still change the effective model or thinking behavior.",
		};
	}

	async getAgentPrompt(
		latestSystemPrompt: LatestSystemPromptSnapshot | null = null,
	): Promise<ToolResult> {
		if (!this.settings) {
			return { error: "Settings are not available." };
		}
		const prompt = this.settings.agentPrompt || DEFAULT_AGENT_PROMPT;
		return {
			success: true,
			prompt,
			prompt_is_default: prompt === DEFAULT_AGENT_PROMPT,
			latest_system_prompt: latestSystemPrompt
				? {
						label: latestSystemPrompt.label,
						content: latestSystemPrompt.content,
						captured_at: latestSystemPrompt.capturedAt,
					}
				: null,
			latest_system_prompt_note: latestSystemPrompt
				? "This is the most recent complete system message sent to a model. Note and attachment bodies are sent separately as message context and are not included."
				: "No system prompt has been captured yet. Send a chat message first.",
		};
	}

	async updateAgentPrompt(args: { prompt: unknown }): Promise<ToolResult> {
		if (!this.settings) {
			return { error: "Settings are not available." };
		}
		if (!this.settings.developerMode) {
			return {
				error: "Developer mode is disabled. Enable it in Settings → Agent Tools to allow the AI to modify settings.",
			};
		}
		if (
			typeof args.prompt !== "string" ||
			!args.prompt.trim() ||
			args.prompt.length > 50000
		) {
			return {
				error: "The agent prompt must be non-empty and no longer than 50,000 characters.",
			};
		}

		const previous = this.settings.agentPrompt;
		this.settings.agentPrompt = args.prompt;
		try {
			await this.saveSettings?.();
		} catch (error: any) {
			this.settings.agentPrompt = previous;
			return {
				error: `Failed to save settings: ${error.message || String(error)}`,
			};
		}
		await this._auditAgentPromptChange(
			"update_agent_prompt",
			args.prompt.length,
		);
		return {
			success: true,
			prompt_length: args.prompt.length,
			prompt_is_default: args.prompt === DEFAULT_AGENT_PROMPT,
		};
	}

	async resetAgentPrompt(): Promise<ToolResult> {
		if (!this.settings) {
			return { error: "Settings are not available." };
		}
		if (!this.settings.developerMode) {
			return {
				error: "Developer mode is disabled. Enable it in Settings → Agent Tools to allow the AI to modify settings.",
			};
		}

		const previous = this.settings.agentPrompt;
		this.settings.agentPrompt = DEFAULT_AGENT_PROMPT;
		try {
			await this.saveSettings?.();
		} catch (error: any) {
			this.settings.agentPrompt = previous;
			return {
				error: `Failed to save settings: ${error.message || String(error)}`,
			};
		}
		await this._auditAgentPromptChange(
			"reset_agent_prompt",
			DEFAULT_AGENT_PROMPT.length,
		);
		return {
			success: true,
			prompt: DEFAULT_AGENT_PROMPT,
			prompt_is_default: true,
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
				error: "Developer mode is disabled. Enable it in Settings → Agent Tools to allow the AI to modify settings.",
			};
		}

		const validation = validateSettingUpdate(args.key, args.value);
		if (!validation.ok) {
			return { error: validation.error };
		}

		// Resolve nested path for assignment
		const resolved = resolveSettingPath(this.settings, args.key);
		if (!resolved) {
			return {
				error: `Failed to resolve path "${args.key}" in settings.`,
			};
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

	async getPluginInfo(
		availableCapabilities: Array<{
			id: string;
			title: string;
			description: string;
			risk: string;
			source: string;
			providerName?: string;
		}>,
	): Promise<ToolResult> {
		// Read manifest.json from the plugin directory
		const pluginId = this.pluginId ?? "obsidian-ai";
		const manifestPath = `${this.app.vault.configDir}/plugins/${pluginId}/manifest.json`;
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(manifestPath))) {
				return { error: "Plugin manifest not found." };
			}
			const content = await adapter.read(manifestPath);
			const manifest = JSON.parse(content);
			const authorUrl =
				typeof manifest.authorUrl === "string"
					? manifest.authorUrl
					: null;
			return {
				success: true,
				content: JSON.stringify(
					{
						name: manifest.name,
						version: manifest.version,
						creator: {
							name: manifest.author,
							profileUrl: authorUrl,
						},
						contact: {
							authorProfile: authorUrl,
							project:
								"https://github.com/space-cadet/obsidian-ai",
							support:
								"https://github.com/space-cadet/obsidian-ai/issues",
						},
						description: manifest.description,
						minAppVersion: manifest.minAppVersion,
						isDesktopOnly: manifest.isDesktopOnly,
						availableCapabilities,
					},
					null,
					2,
				),
			};
		} catch (e: any) {
			return {
				error: `Failed to read plugin manifest: ${e.message || String(e)}`,
			};
		}
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

	private async _auditAgentPromptChange(
		operation: "update_agent_prompt" | "reset_agent_prompt",
		promptLength: number,
	): Promise<void> {
		const adapter = this.app.vault.adapter;
		const pluginId = this.pluginId ?? "obsidian-ai";
		const auditPath = `${this.app.vault.configDir}/plugins/${pluginId}/settings-audit.jsonl`;
		const line =
			JSON.stringify({
				timestamp: new Date().toISOString(),
				operation,
				key: "agentPrompt",
				promptLength,
			}) + "\n";
		try {
			if (await adapter.exists(auditPath)) {
				const existing = await adapter.read(auditPath);
				await adapter.write(auditPath, existing + line);
			} else {
				await adapter.write(auditPath, line);
			}
		} catch {
			// Silently fail audit logging — it is non-critical.
		}
	}
}
