import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["e2e/**/*.{e2e,test,spec}.{ts,tsx}"],
		testTimeout: 60_000, // 60s per test — LLM APIs can be slow
		setupFiles: ["e2e/setup.ts"],
	},
	resolve: {
		alias: {
			obsidian:
				"/Users/sage/.openclaw/workspace/code/obsidian-ai/__mocks__/obsidian.ts",
		},
	},
});
