import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	noteToolsToOpenResponses,
	resolvedToolsToOpenResponses,
} from "./toOpenResponses";

describe("OpenResponses tool projection", () => {
	it("projects current AI SDK tools using the registry key as the name", () => {
		const [projected] = noteToolsToOpenResponses({
			read_note: {
				description: "Read a note.",
				inputSchema: z.object({ path: z.string() }),
			},
		});

		expect(projected).toMatchObject({
			type: "function",
			function: {
				name: "read_note",
				description: "Read a note.",
				parameters: {
					type: "object",
					properties: { path: { type: "string" } },
					required: ["path"],
				},
			},
		});
	});

	it("projects the resolved registry without rebuilding a second tool list", () => {
		const [projected] = resolvedToolsToOpenResponses({
			definitions: [
				{
					id: "provider_status",
					version: 1,
					title: "Provider status",
					description: "Read the current provider status.",
					inputSchema: z.object({}),
					modelTool: {},
					risk: "read",
					source: "provider",
				},
			],
		});

		expect(projected).toMatchObject({
			type: "function",
			function: {
				name: "provider_status",
				description: "Read the current provider status.",
			},
		});
	});
});
