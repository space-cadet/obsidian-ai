import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSession, StoredChatData } from "../../types";
import type { ChatApiManager } from "../../api";
import type { ProviderProfile } from "../../settings";
import { SessionStateOwner } from "../../state/SessionStateOwner";
import {
	replaceSessionTags,
	affectedTagSessions,
	applyTagMerges,
	canonicalTag,
	collectSessionTags,
	suggestLocalTagMerges,
	suggestRelatedTagMerges,
	validateTagMerges,
	TagNormalizationSaveError,
} from "../sessionTagNormalization";
const session = (id: string, tags: string[]): ChatSession => ({
	id,
	title: id,
	tags,
	createdAt: 1,
	updatedAt: 1,
	messages: [],
	hydrated: false,
	messageCount: 10,
	contextItems: [],
});
const rows = [
	session("a", ["AI", "ai", "keep"]),
	session("b", ["ai"]),
	session("c", ["Research Notes", "research-notes"]),
];
const inventory = collectSessionTags(rows);
afterEach(() => vi.restoreAllMocks());
describe("saved-session tag normalization", () => {
	it("changes only selected labels and counts duplicate-only cleanup accurately", () => {
		const replacements = new Map([["AI", "ai"]]);
		expect(replaceSessionTags(["keep", "keep"], replacements)).toEqual([
			"keep",
			"keep",
		]);
		expect(
			replaceSessionTags(["ai", "AI", "keep", "keep"], replacements),
		).toEqual(["ai", "keep", "keep"]);
		const inv = collectSessionTags([session("x", ["ai", "ai"])]);
		expect(
			affectedTagSessions(inv, [
				{ sources: ["ai"], target: "ai", selected: true },
			]),
		).toBe(1);
	});

	it("groups spelling variants without guessing semantic equivalence", () => {
		const merges = suggestLocalTagMerges(
			collectSessionTags([
				...rows,
				session("d", ["Artificial Intelligence"]),
			]),
		);
		expect(merges.find((row) => row.target === "ai")?.sources).toEqual([
			"AI",
			"ai",
		]);
		expect(
			merges.find((row) => row.target === "artificial-intelligence")
				?.sources,
		).toEqual(["Artificial Intelligence"]);
		expect(canonicalTag(" ## Research__Notes  ")).toBe("research-notes");
	});
	it("counts sessions once and excludes sessions already canonical", () => {
		expect(
			affectedTagSessions(inventory, suggestLocalTagMerges(inventory)),
		).toBe(2);
	});
	it("requires a valid target and rejects competing or chained replacements", () => {
		expect(() =>
			validateTagMerges(
				[{ sources: ["AI"], target: "", selected: true }],
				inventory,
			),
		).toThrow("1–32");
		expect(() =>
			validateTagMerges(
				[{ sources: ["AI"], target: "x".repeat(33), selected: true }],
				inventory,
			),
		).toThrow();
		expect(() =>
			validateTagMerges(
				[
					{ sources: ["AI"], target: "ai", selected: true },
					{ sources: ["AI"], target: "other", selected: true },
				],
				inventory,
			),
		).toThrow("more than one");
		expect(() =>
			validateTagMerges(
				[
					{ sources: ["AI"], target: "ai", selected: true },
					{ sources: ["ai"], target: "other", selected: true },
				],
				inventory,
			),
		).toThrow("another merge");
	});
	it("applies selected merges through shared metadata, preserving transcripts and unrelated labels", async () => {
		let saved: StoredChatData | undefined;
		const hydrate = vi.fn();
		const owner = new SessionStateOwner({
			load: async () => ({ sessions: rows, activeSessionId: "a" }),
			hydrate,
			save: async (data) => {
				saved = structuredClone(data);
			},
		});
		await owner.initialize();
		const merges = suggestLocalTagMerges(inventory);
		merges.find((row) => row.target === "research-notes")!.selected = false;
		expect(await applyTagMerges(owner, inventory, merges)).toBe(1);
		expect(saved!.sessions[0].tags).toEqual(["ai", "keep"]);
		expect(saved!.sessions[2].tags).toEqual([
			"Research Notes",
			"research-notes",
		]);
		expect(saved!.sessions[0].messageCount).toBe(10);
		expect(saved!.sessions[0].hydrated).toBe(false);
		expect(hydrate).not.toHaveBeenCalled();
		const reloaded = new SessionStateOwner({
			load: async () => saved!,
			hydrate,
			save: async () => {},
		});
		await reloaded.initialize();
		expect(reloaded.getSnapshot().sessions[0].tags).toEqual(["ai", "keep"]);
	});
	it("refuses stale review plans without modifying current tags", async () => {
		const owner = new SessionStateOwner({
			load: async () => ({ sessions: rows, activeSessionId: null }),
			hydrate: async () => [],
			save: async () => {},
		});
		await owner.initialize();
		owner.updateMetadata("a", { tags: ["AI", "new"] });
		await expect(
			applyTagMerges(owner, inventory, suggestLocalTagMerges(inventory)),
		).rejects.toThrow("Rescan");
		expect(owner.getSnapshot().sessions[0].tags).toEqual(["AI", "new"]);
		await owner.flush();
	});
	it("reports persistence failure and leaves pending metadata available for retry", async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValue(undefined);
		const owner = new SessionStateOwner({
			load: async () => ({ sessions: rows, activeSessionId: null }),
			hydrate: async () => [],
			save,
		});
		await owner.initialize();
		await expect(
			applyTagMerges(owner, inventory, suggestLocalTagMerges(inventory)),
		).rejects.toBeInstanceOf(TagNormalizationSaveError);
		await owner.flush();
		expect(owner.getSnapshot().sessions[0].tags).toEqual(["ai", "keep"]);
	});
	it("sends tag names only and keeps semantic suggestions unselected", async () => {
		const callApi = vi.fn().mockResolvedValue(
			JSON.stringify([
				{ sources: ["AI", "ai"], target: "Artificial Intelligence" },
				{ sources: ["unknown", "keep"], target: "invalid" },
			]),
		);
		const result = await suggestRelatedTagMerges(
			inventory,
			{} as ProviderProfile,
			{ callApi } as unknown as ChatApiManager,
			new AbortController().signal,
		);
		expect(result[0]).toEqual({
			sources: ["AI", "ai"],
			target: "artificial-intelligence",
			selected: false,
		});
		expect(result.some((row) => row.sources.includes("unknown"))).toBe(
			false,
		);
		expect(JSON.parse(callApi.mock.calls[0][1])).toEqual({
			tags: [...inventory.tags.keys()].sort(),
		});
	});
	it("rejects malformed or cancelled provider responses", async () => {
		const controller = new AbortController();
		controller.abort();
		const api = {
			callApi: vi.fn().mockResolvedValue("[]"),
		} as unknown as ChatApiManager;
		await expect(
			suggestRelatedTagMerges(
				inventory,
				{} as ProviderProfile,
				api,
				controller.signal,
			),
		).rejects.toThrow("cancelled");
		await expect(
			suggestRelatedTagMerges(
				inventory,
				{} as ProviderProfile,
				{ callApi: async () => "invalid" } as unknown as ChatApiManager,
				new AbortController().signal,
			),
		).rejects.toThrow();
	});
});
