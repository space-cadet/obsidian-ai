import type { App } from "obsidian";
import type { ToolCall, ToolResult } from "../agent/types";
import type { ToolResolutionContext } from "../agent/toolRegistry";
import {
	createBuiltInToolDefinitions,
	providerCapabilityToToolDefinition,
	resolveToolRegistry,
} from "../agent/toolRegistry";
import type {
	ResolvedToolRegistry,
	ToolDefinition,
} from "../agent/toolRegistry";
import {
	INTEGRATION_PROVIDER_API_VERSION,
	type IntegrationProvider,
	type IntegrationProviderApiContainer,
	type ProviderCapability,
	type ProviderStatusEntry,
} from "./types";

type ToolRecord = Record<string, any>;

interface ProviderSettings {
	enabledIntegrationProviderIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isCapability(value: unknown): value is ProviderCapability {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.title === "string" &&
		typeof value.description === "string" &&
		typeof value.execute === "function" &&
		["read", "write", "remote-write", "destructive"].includes(
			value.risk as string,
		) &&
		"inputSchema" in value
	);
}

function readProvider(value: unknown): IntegrationProvider | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string" || !value.id.trim()) return null;
	if (typeof value.displayName !== "string" || !value.displayName.trim())
		return null;
	if (
		typeof value.apiVersion !== "number" ||
		!Array.isArray(value.capabilities)
	)
		return null;
	if (!value.capabilities.every(isCapability)) return null;
	return value as unknown as IntegrationProvider;
}

/**
 * Discovers public peer-plugin provider APIs and exposes their availability
 * through the same descriptor registry used by built-in tools. T38 still
 * owns provider mutation policy, so non-read capabilities remain hidden.
 */
export class ProviderRegistry {
	private providers = new Map<string, IntegrationProvider>();
	private statuses = new Map<string, ProviderStatusEntry>();

	constructor(
		private app: App,
		private settings: ProviderSettings,
	) {}

	discover(): ProviderStatusEntry[] {
		this.providers.clear();
		this.statuses.clear();

		const installedPlugins = Object.values(
			((this.app as any).plugins?.plugins ?? {}) as Record<
				string,
				unknown
			>,
		);

		for (const plugin of installedPlugins) {
			const container = (
				plugin as { api?: IntegrationProviderApiContainer }
			)?.api;
			const provider = readProvider(container?.integrationProvider);
			if (!provider) continue;

			if (provider.apiVersion !== INTEGRATION_PROVIDER_API_VERSION) {
				this.statuses.set(provider.id, {
					id: provider.id,
					displayName: provider.displayName,
					status: "incompatible",
					apiVersion: provider.apiVersion,
					message: `Requires provider API v${INTEGRATION_PROVIDER_API_VERSION}; found v${provider.apiVersion}.`,
					capabilityCount: provider.capabilities.length,
					enabled: false,
				});
				continue;
			}

			if (this.providers.has(provider.id)) {
				this.statuses.set(provider.id, {
					id: provider.id,
					displayName: provider.displayName,
					status: "invalid",
					apiVersion: provider.apiVersion,
					message:
						"More than one plugin registered this provider ID.",
					capabilityCount: 0,
					enabled: false,
				});
				continue;
			}

			this.providers.set(provider.id, provider);
			const enabled =
				this.settings.enabledIntegrationProviderIds.includes(
					provider.id,
				);
			this.statuses.set(provider.id, {
				id: provider.id,
				displayName: provider.displayName,
				status: enabled ? "available" : "disabled",
				apiVersion: provider.apiVersion,
				message: enabled
					? "Available to Obsidian AI."
					: "Installed but disabled for Obsidian AI.",
				capabilityCount: provider.capabilities.filter(
					(capability) => capability.risk === "read",
				).length,
				enabled,
			});
		}

		return this.getStatuses();
	}

	getStatuses(): ProviderStatusEntry[] {
		return Array.from(this.statuses.values()).sort((a, b) =>
			a.displayName.localeCompare(b.displayName),
		);
	}

	setEnabled(providerId: string, enabled: boolean): void {
		const ids = new Set(this.settings.enabledIntegrationProviderIds);
		if (enabled) ids.add(providerId);
		else ids.delete(providerId);
		this.settings.enabledIntegrationProviderIds = Array.from(ids);
		this.discover();
	}

	getToolRegistry(
		builtInTools: ToolRecord,
		context: ToolResolutionContext = {},
	): ToolRecord {
		return this.getResolvedToolRegistry(builtInTools, context).tools;
	}

	/** Return the complete descriptors used to expose and execute provider tools. */
	getToolDefinitions(): ToolDefinition[] {
		return this.getAllCapabilities().map((capability) => {
			const provider = this.getProviderForCapability(capability.id);
			if (!provider) {
				throw new Error(
					`Provider for capability ${capability.id} is unavailable.`,
				);
			}
			const definition = providerCapabilityToToolDefinition(
				provider.id,
				capability,
			);
			return {
				...definition,
				providerName: provider.displayName,
				availability: () =>
					!this.settings.enabledIntegrationProviderIds.includes(provider.id)
						? "disabled"
						: capability.risk !== "read"
							? "disabled"
							: capability.availability === "disabled" ||
								  capability.availability === "misconfigured"
								? capability.availability
								: "available",
				execute: async (call: ToolCall) =>
					(await this.execute(call)) ?? {
						error: `Integration provider for ${call.toolName} is unavailable.`,
					},
			};
		});
	}

	/** Resolve built-in and provider tools through one descriptor registry. */
	getResolvedToolRegistry(
		builtInTools: ToolRecord,
		context: ToolResolutionContext = {},
	): ResolvedToolRegistry {
		const builtInDefinitions = createBuiltInToolDefinitions(builtInTools);
		return resolveToolRegistry(
			[...builtInDefinitions, ...this.getToolDefinitions()],
			context,
		);
	}

	async execute(call: ToolCall): Promise<ToolResult | null> {
		const capability = this.getCapability(call.toolName);
		if (!capability) return null;

		const provider = this.getProviderForCapability(call.toolName);
		if (!provider)
			return {
				error: `Integration provider for ${call.toolName} is unavailable.`,
			};
		if (
			!this.settings.enabledIntegrationProviderIds.includes(provider.id)
		) {
			return {
				error: `${provider.displayName} is disabled. Re-enable it in Settings → Agent Tools → Integrations.`,
			};
		}
		if (capability.risk !== "read") {
			return {
				error: `${capability.title} is unavailable until the Tool Safety & Approval policy is implemented.`,
			};
		}

		try {
			const result = await capability.execute(call.args, {
				toolCall: call,
				providerId: provider.id,
			});
			return {
				...result,
				providerId: provider.id,
				providerName: provider.displayName,
				capabilityTitle: capability.title,
				risk: capability.risk,
			};
		} catch (error) {
			return {
				error: `${provider.displayName}: ${error instanceof Error ? error.message : String(error)}`,
				providerId: provider.id,
				providerName: provider.displayName,
				capabilityTitle: capability.title,
				risk: capability.risk,
			};
		}
	}

	getCapability(toolName: string): ProviderCapability | null {
		return (
			this.getAllCapabilities().find(
				(capability) => capability.id === toolName,
			) ??
			null
		);
	}

	getCapabilityDisplay(
		toolName: string,
	): { providerName: string; title: string; risk: string } | null {
		const capability = this.getCapability(toolName);
		const provider = this.getProviderForCapability(toolName);
		if (!capability || !provider) return null;
		return {
			providerName: provider.displayName,
			title: capability.title,
			risk: capability.risk,
		};
	}

	private getAllCapabilities(): ProviderCapability[] {
		return Array.from(this.providers.values()).flatMap(
			(provider) => provider.capabilities,
		);
	}

	private getProviderForCapability(
		toolName: string,
	): IntegrationProvider | null {
		return (
			Array.from(this.providers.values()).find((provider) =>
				provider.capabilities.some(
					(capability) => capability.id === toolName,
				),
			) ?? null
		);
	}
}
