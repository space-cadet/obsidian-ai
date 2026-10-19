import { describe, expect, it, vi } from "vitest";
import { initializeStorage } from "../storage";
import { applyPendingDataRepair } from "../../diagnostics/dataRepair";
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
		expect(plugin._chatStorage).toBeUndefined();
		expect(plugin.sessionStorage).toBeUndefined();
		expect(plugin.personaLoader).toBeUndefined();
	});
});
