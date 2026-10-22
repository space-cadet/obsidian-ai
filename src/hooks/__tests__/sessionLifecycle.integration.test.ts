import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatSession } from "../useChatSession";
import { useSessionActions } from "../useSessionActions";
import { useChatRuntimeState } from "../useChatRuntimeState";
import { SessionStateOwner } from "../../state/SessionStateOwner";
import { createStorage } from "../../storage/ChatStorage";

vi.mock("../../settings", () => ({
	getActiveProviderProfile: () => ({ id: "default", provider: "ollama" }),
	normalizeMaxParallelChatSessions: (value: number) => value ?? 5,
}));

const owners = new Set<SessionStateOwner>();
afterEach(async () => {
	cleanup();
	for (const owner of owners) await owner.flush();
	owners.clear();
});
const session = (id: string, patch: any = {}) => ({
	id,
	title: id,
	createdAt: 1,
	updatedAt: 1,
	hydrated: true,
	messageCount: 1,
	messages: [
		{
			id: `${id}-message`,
			role: "user",
			content: "original",
			timestamp: 1,
		},
	],
	contextItems: [],
	...patch,
});
const data = (
	sessions = [session("a"), session("b")],
	openSessionIds = sessions.map((s) => s.id),
) => ({ sessions, activeSessionId: sessions[0]?.id ?? null, openSessionIds });
async function mount(initial: any, existingPlugin?: any) {
	const plugin = existingPlugin ?? {
		settings: {
			restoreChatTabs: true,
			autoNameSessions: false,
			selectedProfileIds: ["default"],
		},
		loadChatData: vi.fn(async () => initial),
		saveChatData: vi.fn(async () => undefined),
		onSessionEnd: vi.fn(),
	};
	const hook = renderHook(() => {
		const chat = useChatSession({ plugin });
		const actions = useSessionActions({
			...chat,
			plugin,
			setScrollToMessageId: vi.fn(),
			setSelectedProfileIds: vi.fn(),
			getSelectedProfileIds: () => ["default"],
			setDebateMode: vi.fn(),
			setWasTruncated: vi.fn(),
			clearSessionRuntime: vi.fn(),
		});
		return { chat, actions };
	});
	await waitFor(() =>
		expect(hook.result.current.chat.chatDataLoaded).toBe(true),
	);
	owners.add(plugin.sessionState);
	return { ...hook, plugin };
}
async function ownerFor(initial: any) {
	const owner = new SessionStateOwner({
		load: async () => initial,
		hydrate: async () => [],
		save: async () => undefined,
	});
	owners.add(owner);
	await owner.initialize();
	return owner;
}

describe("session lifecycle integration", () => {
	it("opens a newly created session before React has refreshed the session ref", async () => {
		const h = await mount(data([session("a")]));
		act(() => h.result.current.actions.handleNewChat());
		const activeId = h.result.current.chat.activeSessionId;
		expect(activeId).not.toBe("a");
		expect(h.result.current.chat.openSessionIds).toEqual(["a", activeId]);
	});
	it("a corrupt session index is not silently replaced by a fresh archive", async () => {
		const root = ".obsidian/plugins/audit/sessions";
		const indexPath = `${root}/index.json`;
		const original = "{ corrupt index";
		const files = new Map([
			[indexPath, original],
			[`${root}/old.jsonl`, "old transcript"],
		]);
		const directories = new Set([root]);
		const adapter = {
			exists: async (p: string) => files.has(p) || directories.has(p),
			read: async (p: string) => files.get(p) ?? "",
			write: async (p: string, value: string) => {
				files.set(p, value);
			},
			mkdir: async (p: string) => {
				directories.add(p);
			},
			remove: async (p: string) => {
				files.delete(p);
			},
			rename: async (a: string, b: string) => {
				files.set(b, files.get(a)!);
				files.delete(a);
			},
			list: async () => ({ files: [], folders: [] }),
			rmdir: async (p: string) => {
				directories.delete(p);
			},
			stat: async (p: string) =>
				files.has(p) ? { size: files.get(p)!.length, mtime: 0 } : null,
		};
		const storage = createStorage(
			{
				app: { vault: { adapter, configDir: ".obsidian" } } as any,
				manifest: { id: "audit" },
				settings: {} as any,
				loadData: async () => ({}),
				saveData: async () => undefined,
			},
			"jsonl",
		);
		await expect(storage.loadChatData()).rejects.toThrow(
			"index could not be read",
		);
		await expect(
			storage.saveChatData(
				data([session("new", { messages: [], messageCount: 0 })]),
			),
		).rejects.toThrow("index could not be read");
		expect(files.get(indexPath)).toBe(original);
	});
	it("closing a tab preserves its unsent text and attachments", async () => {
		const draft = session("draft", {
			messages: [],
			messageCount: 0,
			draft: "unsent",
			draftAttachments: [
				{ id: "file", name: "note.txt", type: "text/plain" },
			],
		});
		const h = await mount(data([draft, session("saved")]));
		act(() => h.result.current.actions.handleCloseTab("draft"));
		expect(
			h.plugin.sessionState
				.getSnapshot()
				.sessions.some((s: any) => s.id === "draft"),
		).toBe(true);
	});
	it("a stale download cannot overwrite an edit after that edit was saved", async () => {
		const owner = await ownerFor(data([session("a")]));
		const baseline = owner.captureSyncRevisions();
		owner.updateMessages("a", [
			{
				id: "latest",
				role: "user",
				content: "new local edit",
				timestamp: 2,
			},
		]);
		await owner.flush();
		owner.applySyncSnapshot(
			data([session("a", { updatedAt: Date.now() + 1000 })]),
			baseline,
		);
		expect(owner.getSnapshot().sessions[0].messages[0].content).toBe(
			"new local edit",
		);
	});
	it("a stale download cannot resurrect a durably deleted session", async () => {
		const owner = await ownerFor(data([session("a")]));
		owner.markDeleted("a");
		await owner.flush();
		owner.applySyncSnapshot(data([session("a")]));
		expect(owner.getSnapshot().sessions).toHaveLength(0);
	});
	it("history deletion removes the deleted tab from view state", async () => {
		const h = await mount(data());
		act(() => h.result.current.actions.handleDeleteSession("a"));
		expect(h.result.current.chat.openSessionIds).not.toContain("a");
	});
	it("deletion in one view reconciles the other view active selection", async () => {
		const first = await mount(data());
		const second = await mount(data(), first.plugin);
		act(() => first.result.current.chat.deleteSession("a"));
		expect(second.result.current.chat.activeSessionId).not.toBe("a");
	});
	it("opening a second view does not discard the first view blank active tab", async () => {
		const first = await mount(data([session("a")]));
		act(() => first.result.current.actions.handleNewChat());
		const draftId = first.result.current.chat.activeSessionId;
		await mount(data(), first.plugin);
		expect(
			first.result.current.chat.sessions.some((s) => s.id === draftId),
		).toBe(true);
	});
	it("a sync index refresh retains a new local draft as the active tab", async () => {
		const h = await mount(data([session("a")]));
		act(() => h.result.current.actions.handleNewChat());
		const draftId = h.result.current.chat.activeSessionId!;
		act(() =>
			h.result.current.chat.updateSessionMetadata(draftId, {
				draft: "new local question",
			}),
		);
		await act(async () => {
			window.dispatchEvent(
				new CustomEvent("obsidian-ai:sessions-updated"),
			);
			await Promise.resolve();
		});
		expect(h.result.current.chat.activeSessionId).toBe(draftId);
	});
	it("unmounting a view does not leave an unreachable run reservation", () => {
		const plugin = {};
		const first = renderHook(() => useChatRuntimeState("a", plugin));
		act(() => {
			first.result.current.reserveSessionRun("a", 5);
			first.result.current.patchRuntime("a", {
				controller: new AbortController(),
				isStreaming: true,
			});
		});
		first.unmount();
		const next = renderHook(() => useChatRuntimeState("a", plugin));
		expect(next.result.current.reserveSessionRun("a", 5)).toBe("reserved");
	});
	it("new chat ends the previous session exactly once", async () => {
		const h = await mount(data([session("a")]));
		act(() => h.result.current.actions.handleNewChat());
		expect(h.plugin.onSessionEnd).toHaveBeenCalledTimes(1);
	});
	it("restoring another chat keeps an attachment-only tabless draft reachable", async () => {
		const draft = session("draft", {
			messages: [],
			messageCount: 0,
			draftAttachments: [
				{ id: "file", name: "note.txt", type: "text/plain" },
			],
		});
		const h = await mount(data([draft, session("saved")]));
		act(() => h.result.current.chat.setOpenSessionIds([]));
		act(() => h.result.current.actions.handleLoadSession("saved"));
		expect(h.result.current.chat.openSessionIds).toEqual([
			"draft",
			"saved",
		]);
	});
	it("an unavailable session link does not activate a nonexistent session", async () => {
		const h = await mount(data([session("a")]));
		act(() => h.result.current.actions.openSessionInTab("deleted-session"));
		expect(h.result.current.chat.activeSessionId).toBe("a");
	});
	it("restoring tabs respects an explicitly saved empty tab list", async () => {
		const h = await mount(data([session("a")], []));
		expect(h.result.current.chat.openSessionIds).toEqual([]);
	});
});
