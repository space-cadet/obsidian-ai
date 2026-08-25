import { tool } from "ai";
import type { ToolCall, ToolResult } from "./types";
import { noteTools } from "./tools";
import type {
	ProviderCapability,
	ProviderAvailability,
	ProviderRisk,
} from "../integrations/types";

/** Host-owned risk classes. Provider risk is normalized into this vocabulary. */
export type HostToolRisk =
	| "read"
	| "local-create"
	| "local-write"
	| "remote-read"
	| "remote-write"
	| "destructive";

export type ToolAvailability = "available" | "disabled" | "misconfigured";

export interface ToolResolutionContext {
	enableMemoryAuditTool?: boolean;
}

export interface ToolDefinition {
	id: string;
	version: 1;
	title: string;
	description: string;
	inputSchema: unknown;
	/** The AI SDK projection retained for compatibility during T60a. */
	modelTool: Record<string, unknown>;
	risk: HostToolRisk;
	source: "builtin" | "provider";
	providerId?: string;
	availability?: (context: ToolResolutionContext) => ToolAvailability;
	/** Execution remains in ToolExecutor until T60c moves it into the registry. */
	execute?: (
		call: ToolCall,
		context: ToolResolutionContext,
	) => Promise<ToolResult>;
}

export interface ResolvedToolRegistry {
	definitions: ToolDefinition[];
	tools: Record<string, Record<string, unknown>>;
	byId: ReadonlyMap<string, ToolDefinition>;
}

const BUILTIN_RISKS: Record<string, HostToolRisk> = {
	read_note: "read",
	edit_note: "local-write",
	append_to_note: "local-write",
	create_note: "local-create",
	create_notes: "local-create",
	patch_note: "local-write",
	edit_section: "local-write",
	search_notes: "read",
	list_notes: "read",
	count_notes: "read",
	get_note_metadata: "read",
	create_folder: "local-create",
	move_note: "local-write",
	delete_note: "destructive",
	list_folders: "read",
	search_web: "remote-read",
	read_pdf: "remote-read",
	create_memory: "local-create",
	update_memory: "local-write",
	delete_memory: "destructive",
	list_memories: "read",
	search_memories: "read",
	read_memory_audit: "read",
	search_past_sessions: "read",
};

function titleForTool(id: string): string {
	return id
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function memoryAuditAvailability(
	context: ToolResolutionContext,
): ToolAvailability {
	return context.enableMemoryAuditTool ? "available" : "disabled";
}

/** Build canonical descriptors over the existing built-in AI SDK tools. */
export function createBuiltInToolDefinitions(
	tools: Record<string, Record<string, unknown>> = noteTools,
): ToolDefinition[] {
	return Object.entries(tools).map(([id, modelTool]) => {
		const description = String(modelTool.description ?? "");
		const inputSchema = modelTool.inputSchema;
		if (!description || inputSchema === undefined) {
			throw new Error(
				`Built-in tool ${id} is missing its model contract.`,
			);
		}
		return {
			id,
			version: 1,
			title: titleForTool(id),
			description,
			inputSchema,
			modelTool,
			risk: BUILTIN_RISKS[id] ?? "read",
			source: "builtin",
			availability:
				id === "read_memory_audit"
					? memoryAuditAvailability
					: () => "available",
		};
	});
}

export function normalizeProviderRisk(risk: ProviderRisk): HostToolRisk {
	switch (risk) {
		case "read":
			return "read";
		case "write":
			return "local-write";
		case "remote-write":
			return "remote-write";
		case "destructive":
			return "destructive";
	}
}

export function providerCapabilityToToolDefinition(
	providerId: string,
	capability: ProviderCapability,
): ToolDefinition {
	const modelTool = tool({
		description: capability.description,
		inputSchema: capability.inputSchema as any,
	}) as unknown as Record<string, unknown>;
	return {
		id: capability.id,
		version: 1,
		title: capability.title,
		description: capability.description,
		inputSchema: capability.inputSchema,
		modelTool,
		risk: normalizeProviderRisk(capability.risk),
		source: "provider",
		providerId,
		availability: () =>
			capability.availability === "disabled" ||
			capability.availability === "misconfigured"
				? capability.availability
				: "available",
	};
}

function assertUniqueDefinitions(definitions: ToolDefinition[]): void {
	const seen = new Set<string>();
	for (const definition of definitions) {
		if (seen.has(definition.id)) {
			throw new Error(`Duplicate tool ID: ${definition.id}`);
		}
		seen.add(definition.id);
	}
}

/** Resolve availability and derive the model-facing registry from descriptors. */
export function resolveToolRegistry(
	definitions: ToolDefinition[],
	context: ToolResolutionContext = {},
): ResolvedToolRegistry {
	assertUniqueDefinitions(definitions);
	const resolved = definitions.filter(
		(definition) =>
			(definition.availability?.(context) ?? "available") === "available",
	);
	const byId = new Map(
		resolved.map((definition) => [definition.id, definition]),
	);
	return {
		definitions: resolved,
		tools: Object.fromEntries(
			resolved.map((definition) => [definition.id, definition.modelTool]),
		),
		byId,
	};
}

export function createBuiltInToolRegistry(
	context: ToolResolutionContext = {},
): ResolvedToolRegistry {
	return resolveToolRegistry(createBuiltInToolDefinitions(), context);
}

/** Provider APIs expose a legacy availability enum; keep the mapping explicit. */
export function normalizeProviderAvailability(
	availability: ProviderAvailability | undefined,
): ToolAvailability {
	return availability ?? "available";
}
