import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../boundedConcurrency";
import { TargetLockManager, ToolLockCancelledError } from "../targetLocks";

describe("bounded tool safety helpers", () => {
	it("keeps concurrent reads within the configured limit", async () => {
		let active = 0;
		let peak = 0;
		const result = await mapWithConcurrency(
			Array.from({ length: 12 }, (_, index) => index),
			3,
			async (value) => {
				active++;
				peak = Math.max(peak, active);
				await Promise.resolve();
				active--;
				return value * 2;
			},
		);

		expect(peak).toBeLessThanOrEqual(3);
		expect(result).toEqual(Array.from({ length: 12 }, (_, i) => i * 2));
	});

	it("serializes the same target and allows different targets to proceed", async () => {
		const locks = new TargetLockManager();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const events: string[] = [];

		const first = locks.runExclusive(["vault:one"], async () => {
			events.push("one-start");
			await gate;
			events.push("one-end");
		});
		const second = locks.runExclusive(["vault:one"], async () => {
			events.push("two-start");
		});
		const other = locks.runExclusive(["vault:other"], async () => {
			events.push("other");
		});

		await other;
		expect(events).toEqual(["one-start", "other"]);
		release();
		await Promise.all([first, second]);
		expect(events).toEqual(["one-start", "other", "one-end", "two-start"]);
	});

	it("cancels a call waiting for a locked target", async () => {
		const locks = new TargetLockManager();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const first = locks.runExclusive(["vault:note"], () =>
			gate.then(() => undefined),
		);
		const controller = new AbortController();
		const waiting = locks.runExclusive(
			["vault:note"],
			async () => undefined,
			controller.signal,
		);
		controller.abort();

		await expect(waiting).rejects.toBeInstanceOf(ToolLockCancelledError);
		release();
		await first;
	});
});
