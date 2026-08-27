// src/agent/tools/toOpenResponses.ts
// Serialize the canonical/AI SDK tool projection to OpenResponses function tools.

import { asSchema } from "ai";

import type { OpenResponsesTool } from "../../api/AgentApiManager";
import type { ResolvedToolRegistry, ToolDefinition } from "../toolRegistry";

interface AiSdkTool {
	description?: string;
	inputSchema?: unknown;
}

interface LegacyTool {
	toolName: string;
	description: string;
	parameters: object;
}

export type OpenResponsesToolDefinition = AiSdkTool & {
	id: string;
};

function toJsonSchema(inputSchema: unknown): object {
	if (inputSchema && typeof inputSchema === "object") {
		const schema = inputSchema as { jsonSchema?: unknown };
		if (schema.jsonSchema && typeof schema.jsonSchema === "object") {
			return schema.jsonSchema as object;
		}
	}
	if (inputSchema === undefined) return { type: "object", properties: {} };
	return asSchema(inputSchema as any).jsonSchema as object;
}

/**
 * Convert a single T13 tool definition to OpenResponses format.
 */
export function toolToOpenResponses(
	tool: OpenResponsesToolDefinition | LegacyTool,
): OpenResponsesTool {
	if ("toolName" in tool) {
		return {
			type: "function",
			function: {
				name: tool.toolName,
				description: tool.description,
				parameters: tool.parameters,
			},
		};
	}
	return {
		type: "function",
		function: {
			name: tool.id,
			description: tool.description,
			parameters: toJsonSchema(tool.inputSchema),
		},
	};
}

/**
 * Convert an array of T13 tool definitions.
 */
export function toolsToOpenResponses(
	tools: Array<OpenResponsesToolDefinition | LegacyTool>,
): OpenResponsesTool[] {
	return tools.map(toolToOpenResponses);
}

/** Convert resolved capability definitions without dropping provider metadata. */
export function resolvedToolsToOpenResponses(
	registry: Pick<ResolvedToolRegistry, "definitions">,
): OpenResponsesTool[] {
	return registry.definitions.map((definition: ToolDefinition) =>
		toolToOpenResponses({
			id: definition.id,
			description: definition.description,
			inputSchema: definition.inputSchema,
		}),
	);
}

/**
 * Convert the noteTools record to OpenResponses format.
 */
export function noteToolsToOpenResponses(
	noteTools: Record<string, AiSdkTool>,
): OpenResponsesTool[] {
	return Object.entries(noteTools).map(([id, tool]) =>
		toolToOpenResponses({ id, ...tool }),
	);
}
