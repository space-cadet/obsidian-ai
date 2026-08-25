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

export type ToolArgumentValidation =
	| { ok: true; args: Record<string, unknown> }
	| { ok: false; error: string };

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
	search_note_content: "read",
	list_notes: "read",
	count_notes: "read",
	get_note_metadata: "read",
	create_folder: "local-create",
	move_note: "local-write",
	delete_note: "destructive",
	list_folders: "read",
	check_paths: "read",
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

function formatValidationIssue(issue: unknown): string {
	if (!issue || typeof issue !== "object") return "invalid arguments";
	const item = issue as { path?: unknown; message?: unknown };
	const path =
		Array.isArray(item.path) && item.path.length > 0
			? `${item.path.join(".")}: `
			: "";
	return `${path}${typeof item.message === "string" ? item.message : "invalid value"}`;
}

function validateJsonObjectSchema(
	schema: Record<string, unknown>,
	args: Record<string, unknown>,
): ToolArgumentValidation {
	if (schema.type !== undefined && schema.type !== "object") {
		return { ok: false, error: "tool arguments must be an object" };
	}

	const required = Array.isArray(schema.required)
		? schema.required.filter(
				(key): key is string => typeof key === "string",
			)
		: [];
	for (const key of required) {
		if (!(key in args)) {
			return { ok: false, error: `missing required argument "${key}"` };
		}
	}

	const properties =
		schema.properties && typeof schema.properties === "object"
			? (schema.properties as Record<string, unknown>)
			: {};
	for (const [key, propertySchema] of Object.entries(properties)) {
		if (
			!(key in args) ||
			!propertySchema ||
			typeof propertySchema !== "object"
		) {
			continue;
		}
		const expected = (propertySchema as { type?: unknown }).type;
		if (typeof expected !== "string") continue;
		const value = args[key];
		const valid =
			expected === "array"
				? Array.isArray(value)
				: expected === "null"
					? value === null
					: expected === "integer"
						? typeof value === "number" &&
							Number.isFinite(value) &&
							Number.isInteger(value)
						: typeof value === expected;
		if (!valid) {
			return {
				ok: false,
				error: `argument "${key}" must be ${expected}`,
			};
		}
	}

	return { ok: true, args };
}

/**
 * Validate model-supplied arguments before any built-in or provider code runs.
 * Built-in schemas are Zod schemas; provider schemas may also expose their
 * generated JSON Schema through AI SDK's jsonSchema property.
 */
export async function validateToolArguments(
	definition: ToolDefinition,
	args: unknown,
): Promise<ToolArgumentValidation> {
	if (!args || typeof args !== "object" || Array.isArray(args)) {
		return { ok: false, error: "tool arguments must be an object" };
	}

	const objectArgs = args as Record<string, unknown>;
	const schema = definition.inputSchema as {
		safeParse?: (value: unknown) => {
			success: boolean;
			data?: unknown;
			error?: { issues?: unknown[] };
		};
		jsonSchema?: unknown;
		["~standard"]?: {
			version?: number;
			validate?: (
				value: unknown,
			) =>
				| { value: unknown }
				| { issues: unknown[] }
				| Promise<{ value: unknown } | { issues: unknown[] }>;
		};
	};

	if (typeof schema?.safeParse === "function") {
		const parsed = schema.safeParse(objectArgs);
		if (!parsed.success) {
			const issues = parsed.error?.issues ?? [];
			return {
				ok: false,
				error:
					issues.length > 0
						? issues.map(formatValidationIssue).join("; ")
						: "invalid arguments",
			};
		}
		if (
			!parsed.data ||
			typeof parsed.data !== "object" ||
			Array.isArray(parsed.data)
		) {
			return { ok: false, error: "tool arguments must be an object" };
		}
		return { ok: true, args: parsed.data as Record<string, unknown> };
	}

	const standard = schema?.["~standard"] as
		| {
				version?: number;
				validate?: (
					value: unknown,
				) =>
					| { value: unknown }
					| { issues: unknown[] }
					| Promise<{ value: unknown } | { issues: unknown[] }>;
		  }
		| undefined;
	if (typeof standard?.validate === "function") {
		const result = await standard.validate(objectArgs);
		if ("issues" in result) {
			return {
				ok: false,
				error:
					result.issues.length > 0
						? result.issues.map(formatValidationIssue).join("; ")
						: "invalid arguments",
			};
		}
		if (
			!result.value ||
			typeof result.value !== "object" ||
			Array.isArray(result.value)
		) {
			return { ok: false, error: "tool arguments must be an object" };
		}
		return { ok: true, args: result.value as Record<string, unknown> };
	}

	const jsonSchema =
		schema?.jsonSchema && typeof schema.jsonSchema === "object"
			? (schema.jsonSchema as Record<string, unknown>)
			: undefined;
	if (jsonSchema) return validateJsonObjectSchema(jsonSchema, objectArgs);

	return {
		ok: false,
		error: "tool schema cannot be validated locally",
	};
}

function assertObjectLikeInputSchema(
	toolId: string,
	inputSchema: unknown,
): void {
	if (!inputSchema || typeof inputSchema !== "object") {
		throw new Error(
			`Tool ${toolId} must declare an object-like input schema.`,
		);
	}
	const schema = inputSchema as {
		safeParse?: unknown;
		jsonSchema?: unknown;
		["~standard"]?: { validate?: unknown };
		_def?: { typeName?: unknown; type?: unknown };
	};
	if (typeof schema.safeParse === "function") {
		const typeName = schema._def?.typeName ?? schema._def?.type;
		if (
			typeName !== undefined &&
			typeName !== "ZodObject" &&
			typeName !== "object"
		) {
			throw new Error(
				`Tool ${toolId} must declare an object-like input schema.`,
			);
		}
		return;
	}
	if (schema.jsonSchema && typeof schema.jsonSchema === "object") return;
	if (typeof schema["~standard"]?.validate === "function") return;
	throw new Error(
		`Tool ${toolId} must declare a locally inspectable input schema.`,
	);
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
		assertObjectLikeInputSchema(id, inputSchema);
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

/**
 * Create built-in definitions with execute handlers bound.
 *
 * This is the integration point for T60a: ToolExecutor constructs the
 * registry and injects its own private methods as executors. Once the
 * registry is the sole source of truth, this factory moves into the
 * registry module and ToolExecutor becomes a thin facade.
 */
export function createBuiltInToolDefinitionsWithExecutors(
	executors: Record<
		string,
		(
			call: import("./types").ToolCall,
			context: ToolResolutionContext,
		) => Promise<import("./types").ToolResult>
	>,
	tools: Record<string, Record<string, unknown>> = noteTools,
): ToolDefinition[] {
	const definitions = createBuiltInToolDefinitions(tools);
	return definitions.map((definition) => {
		const execute = executors[definition.id] as
			| ((
					call: import("./types").ToolCall,
					context: ToolResolutionContext,
			  ) => Promise<import("./types").ToolResult>)
			| undefined;
		return execute ? { ...definition, execute } : definition;
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
	assertObjectLikeInputSchema(capability.id, capability.inputSchema);
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
