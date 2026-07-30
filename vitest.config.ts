import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
	},
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts"),
		},
	},
});
