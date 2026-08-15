import type { ToolCall, ToolResult } from "../agent/types";

export const INTEGRATION_PROVIDER_API_VERSION = 1 as const;

export type ProviderRisk = "read" | "write" | "remote-write" | "destructive";

export type ProviderAvailability = "available" | "disabled" | "misconfigured";

/**
 * This is intentionally structural. Provider plugins are independently built,
 * so Obsidian AI validates the public shape at runtime rather than importing
 * their private implementation types.
 */
export interface ProviderCapability {
	id: string;
	title: string;
	description: string;
	inputSchema: unknown;
	risk: ProviderRisk;
	availability?: ProviderAvailability;
	execute: (
		args: Record<string, unknown>,
		context: ProviderExecutionContext,
	) => Promise<ToolResult>;
}

export interface IntegrationProvider {
	id: string;
	displayName: string;
	apiVersion: typeof INTEGRATION_PROVIDER_API_VERSION;
	capabilities: ProviderCapability[];
}

export interface ProviderExecutionContext {
	toolCall: ToolCall;
	providerId: string;
}

export interface IntegrationProviderApiContainer {
	integrationProvider?: IntegrationProvider;
}

export type ProviderStatus =
	| "available"
	| "disabled"
	| "incompatible"
	| "invalid";

export interface ProviderStatusEntry {
	id: string;
	displayName: string;
	status: ProviderStatus;
	apiVersion?: number;
	message: string;
	capabilityCount: number;
	enabled: boolean;
}
