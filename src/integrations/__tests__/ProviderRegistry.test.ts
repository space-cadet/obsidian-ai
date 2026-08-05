import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderRegistry } from "../ProviderRegistry";
import type { IntegrationProvider } from "../types";

const builtInTools = { built_in: { description: "Built in", inputSchema: z.object({}) } };

function makeApp(provider?: IntegrationProvider) {
	return {
		plugins: {
			plugins: provider
				? { "example-provider": { api: { integrationProvider: provider } } }
				: {},
		},
	} as any;
}

function makeProvider(overrides: Partial<IntegrationProvider> = {}): IntegrationProvider {
	return {
		id: "example-provider",
		displayName: "Example Provider",
		apiVersion: 1,
		capabilities: [
			{
				id: "example.status",
				title: "Read status",
				description: "Read the example status.",
				inputSchema: z.object({}),
				risk: "read",
				execute: async () => ({ success: true, content: "Ready" }),
			},
		],
		...overrides,
	};
}

describe("ProviderRegistry", () => {
	it("discovers a compatible provider but keeps it disabled by default", () => {
		const registry = new ProviderRegistry(makeApp(makeProvider()), {
			enabledIntegrationProviderIds: [],
		});

		const [status] = registry.discover();
		expect(status).toMatchObject({
			id: "example-provider",
			status: "disabled",
			capabilityCount: 1,
			enabled: false,
		});
		expect(registry.getToolRegistry(builtInTools)).toEqual(builtInTools);
	});

	it("adds enabled read-only capabilities to the agent tool registry and executes them", async () => {
		const settings = { enabledIntegrationProviderIds: ["example-provider"] };
		const registry = new ProviderRegistry(makeApp(makeProvider()), settings);
		registry.discover();

		expect(registry.getToolRegistry(builtInTools)).toHaveProperty("example.status");
		const result = await registry.execute({
			toolCallId: "call-1",
			toolName: "example.status",
			args: {},
		});
		expect(result).toMatchObject({
			success: true,
			content: "Ready",
			providerId: "example-provider",
			providerName: "Example Provider",
			risk: "read",
		});
	});

	it("reports incompatible provider versions without registering tools", () => {
		const registry = new ProviderRegistry(
			makeApp(makeProvider({ apiVersion: 2 as 1 })),
			{ enabledIntegrationProviderIds: ["example-provider"] },
		);

		const [status] = registry.discover();
		expect(status.status).toBe("incompatible");
		expect(registry.getToolRegistry(builtInTools)).toEqual(builtInTools);
	});

	it("does not expose mutation capabilities before T38 policy support", () => {
		const provider = makeProvider({
			capabilities: [
				{
					id: "example.write",
					title: "Write example",
					description: "Write example data.",
					inputSchema: z.object({}),
					risk: "write",
					execute: async () => ({ success: true }),
				},
			],
		});
		const registry = new ProviderRegistry(makeApp(provider), {
			enabledIntegrationProviderIds: ["example-provider"],
		});
		registry.discover();

		expect(registry.getToolRegistry(builtInTools)).toEqual(builtInTools);
	});
});
