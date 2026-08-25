import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	createBuiltInToolDefinitions,
	createBuiltInToolRegistry,
	providerCapabilityToToolDefinition,
	resolveToolRegistry,
	validateToolArguments,
} from "../toolRegistry";

describe("canonical tool registry", () => {
	it("describes every built-in tool exactly once", () => {
		const definitions = createBuiltInToolDefinitions();
		expect(
			new Set(definitions.map((definition) => definition.id)).size,
		).toBe(definitions.length);
		expect(
			definitions.every((definition) => definition.version === 1),
		).toBe(true);
		expect(definitions.find((d) => d.id === "edit_note")?.risk).toBe(
			"local-write",
		);
		expect(definitions.find((d) => d.id === "delete_note")?.risk).toBe(
			"destructive",
		);
	});

	it("does not expose unavailable tools to the model", () => {
		const disabled = createBuiltInToolRegistry({
			enableMemoryAuditTool: false,
		});
		const enabled = createBuiltInToolRegistry({
			enableMemoryAuditTool: true,
		});

		expect(disabled.tools).not.toHaveProperty("read_memory_audit");
		expect(enabled.tools).toHaveProperty("read_memory_audit");
	});

	it("rejects collisions before filtering availability", () => {
		const [definition] = createBuiltInToolDefinitions().slice(0, 1);
		expect(() =>
			resolveToolRegistry([definition, { ...definition }]),
		).toThrow("Duplicate tool ID");
	});

	it("normalizes provider metadata into the host descriptor", () => {
		const definition = providerCapabilityToToolDefinition("example", {
			id: "example.status",
			title: "Read status",
			description: "Read provider status.",
			inputSchema: z.object({ query: z.string() }),
			risk: "read",
			execute: async () => ({ success: true }),
		});

		expect(definition).toMatchObject({
			id: "example.status",
			source: "provider",
			providerId: "example",
			risk: "read",
		});
		expect(definition.modelTool).toHaveProperty("inputSchema");
	});

	it("validates arguments against the canonical schema", async () => {
		const definition = createBuiltInToolDefinitions().find(
			(item) => item.id === "read_note",
		)!;

		expect(
			await validateToolArguments(definition, { path: "Ideas" }),
		).toEqual({
			ok: true,
			args: { path: "Ideas" },
		});
		expect(await validateToolArguments(definition, {})).toMatchObject({
			ok: false,
			error: expect.stringContaining("path"),
		});
	});

	it("accepts standard-schema provider validators", async () => {
		const definition = providerCapabilityToToolDefinition("example", {
			id: "example.standard",
			title: "Standard schema",
			description: "Uses the standard validation interface.",
			inputSchema: {
				["~standard"]: {
					version: 1,
					vendor: "test",
					validate(value: unknown) {
						if (
							value &&
							typeof value === "object" &&
							"path" in value &&
							typeof (value as { path?: unknown }).path ===
								"string"
						) {
							return { value };
						}
						return {
							issues: [
								{ path: ["path"], message: "path is required" },
							],
						};
					},
				},
			},
			risk: "read",
			execute: async () => ({ success: true }),
		});

		expect(
			await validateToolArguments(definition, { path: "Ideas" }),
		).toEqual({ ok: true, args: { path: "Ideas" } });
		expect(await validateToolArguments(definition, {})).toMatchObject({
			ok: false,
			error: expect.stringContaining("path"),
		});
	});

	it("accepts integer-valued JSON Schema properties", async () => {
		const definition = {
			id: "example.integer",
			version: 1 as const,
			title: "Integer schema",
			description: "Uses a JSON Schema integer.",
			inputSchema: {
				jsonSchema: {
					type: "object",
					properties: { limit: { type: "integer" } },
					required: ["limit"],
				},
			},
			modelTool: {},
			risk: "read" as const,
			source: "provider" as const,
		};

		expect(await validateToolArguments(definition, { limit: 5 })).toEqual({
			ok: true,
			args: { limit: 5 },
		});
		expect(
			await validateToolArguments(definition, { limit: 5.5 }),
		).toMatchObject({
			ok: false,
			error: expect.stringContaining("integer"),
		});
	});

	it("rejects provider schemas that are not object-shaped", () => {
		expect(() =>
			providerCapabilityToToolDefinition("example", {
				id: "example.bad",
				title: "Bad schema",
				description: "Not an object schema.",
				inputSchema: z.string(),
				risk: "read",
				execute: async () => ({ success: true }),
			}),
		).toThrow("object-like input schema");
	});
});
