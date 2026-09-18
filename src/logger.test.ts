import { describe, expect, it, vi } from "vitest";
import {
	FileLogger,
	MAX_MEMORY_LOG_INTERVAL_SECONDS,
	MIN_MEMORY_LOG_INTERVAL_SECONDS,
	normalizeMemoryLogIntervalSeconds,
} from "./logger";

function makeLogger(): FileLogger {
	return new FileLogger(
		{
			vault: {
				configDir: ".obsidian",
				adapter: {
					append: vi.fn().mockResolvedValue(undefined),
					read: vi.fn().mockResolvedValue(""),
					write: vi.fn().mockResolvedValue(undefined),
				},
			},
		} as any,
		"obsidian-ai",
	);
}

describe("FileLogger memory diagnostics", () => {
	it("clamps the memory interval to the supported baseline range", () => {
		expect(normalizeMemoryLogIntervalSeconds(1)).toBe(
			MIN_MEMORY_LOG_INTERVAL_SECONDS,
		);
		expect(normalizeMemoryLogIntervalSeconds(99999)).toBe(
			MAX_MEMORY_LOG_INTERVAL_SECONDS,
		);
		expect(normalizeMemoryLogIntervalSeconds("invalid")).toBe(60);
	});

	it("keeps baseline metrics at Errors-only verbosity", () => {
		const logger = makeLogger();
		logger.setLogLevel("error");

		logger.log("info", "hidden info");
		logger.log("metric", "baseline memory");

		const buffered = (logger as any).buffer.join("");
		expect(buffered).not.toContain("hidden info");
		expect(buffered).toContain("baseline memory");
	});

	it("uses the configured interval instead of the old ten-second cadence", () => {
		vi.useFakeTimers();
		try {
			const logger = makeLogger();
			const snapshot = vi.spyOn(logger, "logMemorySnapshot");
			(logger as any).initialized = true;
			logger.setMemoryLogIntervalSeconds(120);

			vi.advanceTimersByTime(119_999);
			expect(snapshot).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(snapshot).toHaveBeenCalledOnce();
			logger.stopMemoryLogging();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("FileLogger console capture scope", () => {
	it("does not capture console output from outside the plugin bundle", () => {
		const logger = makeLogger();
		// Simulate the wrapped console without init()'s timers and side effects.
		(logger as any).wrapConsole();
		try {
			// This test file is not the plugin's main.js, so the call site is
			// "someone else" — exactly what a third-party plugin would look like.
			console.log("other-plugin noise", { a: 1 });
			console.error("other-plugin error");

			const buffered = (logger as any).buffer.join("");
			expect(buffered).not.toContain("other-plugin noise");
			expect(buffered).not.toContain("other-plugin error");
		} finally {
			(logger as any).unwrapConsole();
		}
	});

	it("still captures direct logger writes", () => {
		const logger = makeLogger();
		logger.setLogLevel("debug");
		logger.log("debug", "own debug line");
		const buffered = (logger as any).buffer.join("");
		expect(buffered).toContain("own debug line");
	});
});
