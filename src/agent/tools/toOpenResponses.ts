// src/agent/tools/toOpenResponses.ts
// Serialize T13 tool definitions to OpenResponses function tool schema

import type { OpenResponsesTool } from "../../api/AgentApiManager";

interface T13Tool {
	toolName: string;
	description: string;
	parameters: {
		type: string;
		properties?: Record<string, any>;
		required?: string[];
	};
}

/**
 * Convert a single T13 tool definition to OpenResponses format.
 */
export function toolToOpenResponses(tool: T13Tool): OpenResponsesTool {
	return {
		type: "function",
		function: {
			name: tool.toolName,
			description: tool.description,
			parameters: tool.parameters,
		},
	};
}

/**
 * Convert an array of T13 tool definitions.
 */
export function toolsToOpenResponses(tools: T13Tool[]): OpenResponsesTool[] {
	return tools.map(toolToOpenResponses);
}

/**
 * Convert the noteTools record to OpenResponses format.
 */
export function noteToolsToOpenResponses(
	noteTools: Record<string, T13Tool>,
): OpenResponsesTool[] {
	return Object.values(noteTools).map(toolToOpenResponses);
}
