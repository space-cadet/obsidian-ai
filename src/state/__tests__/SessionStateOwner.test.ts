import { describe, expect, it, vi } from "vitest";
import type { ChatSession, StoredChatData } from "../../types";
import { SessionStateOwner } from "../SessionStateOwner";

function session(overrides: Partial<ChatSession> = {}): ChatSession {
	return {
		id: "s1",
		title: "",
		createdAt: 1,
		updatedAt: 1,
		messages: [],
		messageCount: 1,
		hydrated: false,
		contextItems: [],
		...overrides,
	};
}

function makeStorage(
	data: StoredChatData,
	hydrate = vi.fn(async () => [
		{ id: "m1", role: "user" as const, content: "disk", timestamp: 1 },
	]),
) {
	return {
		load: vi.fn(async () => data),
		hydrate,
		save: vi.fn(async () => undefined),
	};
}

describe("SessionStateOwner", () => {
	it("publishes transcript readiness with the installed payload", async () => {
		const storage = makeStorage({
			sessions: [session()],
			activeSessionId: "s1",
		});
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		const loaded = await owner.ensureLoaded("s1");
		expect(loaded?.hydrated).toBe(true);
		expect(owner.getSnapshot().sessions[0].messages[0].content).toBe(
			"disk",
		);
		expect(storage.hydrate).toHaveBeenCalledTimes(1);
	});

	it("does not install a late hydration after deletion", async () => {
		let finish!: (
			messages: Awaited<ReturnType<NonNullable<typeof storage.hydrate>>>,
		) => void;
		const storage = makeStorage(
			{ sessions: [session()], activeSessionId: "s1" },
			vi.fn(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			),
		);
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		const loading = owner.ensureLoaded("s1");
		await vi.waitFor(() => expect(storage.hydrate).toHaveBeenCalledOnce());
		owner.markDeleted("s1");
		finish([{ id: "m1", role: "user", content: "late", timestamp: 1 }]);
		await loading;
		expect(owner.getSnapshot().sessions).toEqual([]);
		expect(owner.getSnapshot().deletedSessionIds).toContain("s1");
	});

	it("keeps an explicit deletion authoritative over a sync snapshot", async () => {
		const storage = makeStorage({
			sessions: [session()],
			activeSessionId: "s1",
		});
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		owner.markDeleted("s1");
		owner.applySyncSnapshot({
			sessions: [session({ hydrated: true })],
			activeSessionId: "s1",
		});
		expect(owner.getSnapshot().sessions).toEqual([]);
		expect(owner.getSnapshot().deletedSessionIds).toContain("s1");
	});

	it("does not replace a newer edit with a late hydration result", async () => {
		let finish!: (messages: any[]) => void;
		const storage = makeStorage(
			{ sessions: [session()], activeSessionId: "s1" },
			vi.fn(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			),
		);
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		const loading = owner.ensureLoaded("s1");
		await vi.waitFor(() => expect(storage.hydrate).toHaveBeenCalledOnce());
		owner.applySyncSnapshot({
			sessions: [
				session({
					hydrated: true,
					messages: [
						{
							id: "new",
							role: "user",
							content: "edit",
							timestamp: 2,
						},
					],
				}),
			],
			activeSessionId: "s1",
		});
		finish([{ id: "disk", role: "user", content: "stale", timestamp: 1 }]);
		await loading;
		expect(owner.getSnapshot().sessions[0].messages[0].id).toBe("new");
	});

	it("keeps metadata edits lazy and messages unchanged", async () => {
		const storage = makeStorage({
			sessions: [session()],
			activeSessionId: "s1",
		});
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		owner.updateMetadata("s1", { title: "Renamed" });
		expect(storage.hydrate).not.toHaveBeenCalled();
		expect(owner.getSnapshot().sessions[0]).toMatchObject({
			title: "Renamed",
			messages: [],
			hydrated: false,
		});
	});

	it("preserves a local revision when a stale sync snapshot arrives", async () => {
		const storage = makeStorage({
			sessions: [session({ hydrated: true, messageCount: 0 })],
			activeSessionId: "s1",
		});
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		owner.updateMetadata("s1", { title: "Local edit" });
		owner.applySyncSnapshot({
			sessions: [
				session({
					hydrated: true,
					messageCount: 0,
					title: "Old cloud title",
				}),
			],
			activeSessionId: "s1",
		});
		expect(owner.getSnapshot().sessions[0].title).toBe("Local edit");
	});

	it("keeps loaded messages during a matching index refresh", async () => {
		const loaded = session({
			hydrated: true,
			messageCount: 1,
			updatedAt: 10,
			messages: [
				{ id: "m1", role: "user", content: "local", timestamp: 1 },
			],
		});
		const storage = makeStorage({
			sessions: [loaded],
			activeSessionId: "s1",
		});
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		owner.applySyncSnapshot({
			sessions: [session({ updatedAt: 10, hydrated: false })],
			activeSessionId: "s1",
		});
		expect(owner.getSnapshot().sessions[0]).toMatchObject({
			hydrated: true,
			messages: [{ id: "m1", content: "local" }],
		});
	});

	it("retries hydration after a newer sync snapshot supersedes the read", async () => {
		let finishFirst!: (messages: any[]) => void;
		const hydrate = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finishFirst = resolve;
					}),
			)
			.mockResolvedValueOnce([
				{ id: "m1", role: "user", content: "one", timestamp: 1 },
				{ id: "m2", role: "assistant", content: "two", timestamp: 2 },
			]);
		const storage = makeStorage(
			{ sessions: [session()], activeSessionId: "s1" },
			hydrate,
		);
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		const loading = owner.ensureLoaded("s1");
		await vi.waitFor(() => expect(hydrate).toHaveBeenCalledTimes(1));
		owner.applySyncSnapshot({
			sessions: [session({ updatedAt: 2, messageCount: 2 })],
			activeSessionId: "s1",
		});
		finishFirst([
			{ id: "stale", role: "user", content: "old", timestamp: 1 },
		]);
		await loading;
		await vi.waitFor(() =>
			expect(owner.getSnapshot().sessions[0].hydrated).toBe(true),
		);
		expect(hydrate).toHaveBeenCalledTimes(2);
		expect(
			owner
				.getSnapshot()
				.sessions[0].messages.map((message) => message.id),
		).toEqual(["m1", "m2"]);
	});

	it("allows a failed write to be retried by a later flush", async () => {
		const storage = makeStorage({
			sessions: [session({ hydrated: true, messageCount: 0 })],
			activeSessionId: "s1",
		});
		storage.save.mockRejectedValueOnce(new Error("disk busy"));
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		owner.updateMetadata("s1", { title: "Renamed" });
		await expect(owner.flush()).rejects.toThrow("disk busy");
		await owner.flush();
		expect(storage.save).toHaveBeenCalledTimes(2);
	});

	it("retains deletion IDs until the durable write succeeds", async () => {
		const storage = makeStorage({
			sessions: [session()],
			activeSessionId: "s1",
		});
		storage.save.mockRejectedValueOnce(new Error("disk busy"));
		const owner = new SessionStateOwner(storage);
		await owner.initialize();
		owner.markDeleted("s1");
		await expect(owner.flush()).rejects.toThrow("disk busy");
		expect(owner.getSnapshot().deletedSessionIds).toContain("s1");
		await owner.flush();
		expect(owner.getSnapshot().deletedSessionIds).not.toContain("s1");
	});
});
