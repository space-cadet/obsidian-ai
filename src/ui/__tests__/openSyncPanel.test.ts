import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../registration", () => ({
	activateChatView: vi.fn().mockResolvedValue(undefined),
}));

import { openSyncPanel } from "../openSyncPanel";
import { activateChatView } from "../registration";

const activateChatViewMock = vi.mocked(activateChatView);

describe("openSyncPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		activateChatViewMock.mockResolvedValue(undefined);
	});

	it("switches tabs directly when ChatApp is mounted", async () => {
		const now = vi.fn();
		const plugin = {
			openSyncTabNow: now,
			pendingSyncTabOpen: false,
		} as any;

		await openSyncPanel(plugin);

		expect(now).toHaveBeenCalledTimes(1);
		expect(activateChatViewMock).not.toHaveBeenCalled();
		expect(plugin.pendingSyncTabOpen).toBe(false);
	});

	it("sets pendingSyncTabOpen and activates the view when not mounted", async () => {
		const plugin = {} as any;

		await openSyncPanel(plugin);

		expect(plugin.pendingSyncTabOpen).toBe(true);
		expect(activateChatViewMock).toHaveBeenCalledTimes(1);
		expect(activateChatViewMock).toHaveBeenCalledWith(plugin);
	});

	it("takes the request if ChatApp mounts during activation", async () => {
		const plugin = {} as any;
		activateChatViewMock.mockImplementation(async (p: any) => {
			p.openSyncTabNow = vi.fn();
		});

		await openSyncPanel(plugin);

		expect(plugin.openSyncTabNow).toHaveBeenCalledTimes(1);
	});
});
