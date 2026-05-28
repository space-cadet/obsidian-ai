import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
	},
	resolve: {
		alias: {
			obsidian: "/Users/sage/.openclaw/workspace/code/obsidian-ai/__mocks__/obsidian.ts",
		},
	},
});
