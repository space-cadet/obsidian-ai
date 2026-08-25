import { describe, expect, it } from "vitest";
import { z } from "zod";
import { noteToolsToOpenResponses } from "./toOpenResponses";

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
});
