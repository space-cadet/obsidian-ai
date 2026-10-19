import { describe, expect, it, vi } from "vitest";
import { initializeStorage } from "../storage";
import { applyPendingDataRepair } from "../../diagnostics/dataRepair";
const logger = vi.hoisted(() => ({
	init: vi.fn().mockResolvedValue(undefined),
	log: vi.fn(),
	flushNow: vi.fn(),
}));
vi.mock("../../logger", () => ({ createFileLogger: () => logger }));
vi.mock("../persistence", () => ({
	loadSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../diagnostics/dataRepair", () => ({
	applyPendingDataRepair: vi.fn(),
}));
describe("startup repair protection", () => {
	it("stops initialization before any storage caches when a repair needs recovery", async () => {
		vi.mocked(applyPendingDataRepair).mockResolvedValue({
			status: "interrupted",
			message: "Manual recovery required",
			filesChanged: 0,
		});
		const adapter = { exists: vi.fn().mockResolvedValue(false) };
		const plugin = {
			app: { vault: { adapter, configDir: ".custom" } },
			manifest: { id: "chat-lab" },
		} as any;
		await expect(initializeStorage(plugin)).rejects.toThrow(
			"Manual recovery required",
		);
		expect(applyPendingDataRepair).toHaveBeenCalledWith(
			adapter,
			".custom/plugins/chat-lab",
		);
		expect(logger.init.mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(applyPendingDataRepair).mock.invocationCallOrder[0],
		);
		expect(logger.log).toHaveBeenCalledWith(
			"error",
			"[Startup] pending data repair check failed",
			expect.any(Error),
		);
		expect(plugin._chatStorage).toBeUndefined();
		expect(plugin.sessionStorage).toBeUndefined();
		expect(plugin.personaLoader).toBeUndefined();
	});
});
