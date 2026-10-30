import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/dom";
import type ObsidianAIPlugin from "../../main";
import type { ChatSession } from "../../types";
vi.mock("obsidian", () => ({
	Modal: class {
		modalEl = document.createElement("div");
		contentEl = document.createElement("div");
		titleEl = document.createElement("h2");
		constructor(public app: unknown) {
			this.modalEl.append(this.titleEl, this.contentEl);
		}
		open() {
			document.body.append(this.modalEl);
			this.onOpen();
		}
		onOpen() {}
		onClose() {}
		close() {
			this.onClose();
			this.modalEl.remove();
		}
	},
	ButtonComponent: class {
		buttonEl = document.createElement("button");
		constructor(parent: HTMLElement) {
			parent.append(this.buttonEl);
		}
		setButtonText(text: string) {
			this.buttonEl.textContent = text;
			return this;
		}
		setDisabled(value: boolean) {
			this.buttonEl.disabled = value;
			return this;
		}
		setCta() {
			return this;
		}
		onClick(cb: () => void) {
			this.buttonEl.addEventListener("click", cb);
			return this;
		}
	},
}));
import { NormalizeSessionTagsModal } from "../NormalizeSessionTagsModal";
beforeAll(() => {
	const hp = HTMLElement.prototype as any;
	hp.empty = function () {
		this.replaceChildren();
	};
	hp.addClass = function (cls: string) {
		this.classList.add(cls);
	};
	hp.setText = function (text: string) {
		this.textContent = text;
	};
	hp.createEl = function (tag: string, options: any = {}) {
		const el = document.createElement(tag);
		if (options.cls) el.className = options.cls;
		if (options.text) el.textContent = options.text;
		if (options.type) el.setAttribute("type", options.type);
		if (options.value !== undefined)
			(el as HTMLInputElement).value = options.value;
		this.append(el);
		return el;
	};
	hp.createDiv = function (options: any) {
		return this.createEl("div", options);
	};
	hp.createSpan = function (options: any) {
		return this.createEl("span", options);
	};
});
afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});
function setup(
	save = vi.fn().mockResolvedValue(undefined),
	api = vi
		.fn()
		.mockResolvedValue(
			'[{"sources":["AI","ai"],"target":"artificial-intelligence"}]',
		),
) {
	const sessions = [
		{ id: "a", tags: ["AI", "ai", "keep"] },
		{ id: "b", tags: ["Research Notes", "research-notes"] },
	].map((s) => ({
		...s,
		title: s.id,
		createdAt: 1,
		updatedAt: 1,
		messages: [],
		messageCount: 2,
		hydrated: false,
		contextItems: [],
	})) as ChatSession[];
	const plugin = {
		settings: {
			providerProfiles: [
				{
					id: "p",
					name: "Test provider",
					provider: "custom",
					model: "test",
				},
			],
			sessionTaggingProfileId: "p",
		},
		loadChatData: async () => ({ sessions, activeSessionId: null }),
		hydrateSession: vi.fn(),
		saveChatData: save,
		chatapi: { callApi: api },
	} as unknown as ObsidianAIPlugin;
	const modal = new NormalizeSessionTagsModal({} as any, plugin);
	modal.open();
	return { modal, plugin, save, api };
}
function button(prefix: string): HTMLButtonElement {
	return Array.from(document.querySelectorAll("button")).find((el) =>
		el.textContent?.startsWith(prefix),
	)!;
}
async function ready() {
	await waitFor(() => expect(button("Apply 2 merges")?.disabled).toBe(false));
}
describe("NormalizeSessionTagsModal", () => {
	it("aborts outstanding suggestions when cancelled and never saves them", async () => {
		const api = vi.fn(
			(
				_system: string,
				_input: string,
				_profile: unknown,
				signal: AbortSignal,
			) =>
				new Promise<string>((resolve, reject) => {
					signal.addEventListener("abort", () =>
						reject(new Error("aborted")),
					);
				}),
		);
		const { modal, save } = setup(undefined, api);
		await ready();
		fireEvent.click(button("Suggest related tags"));
		await waitFor(() => expect(button("Cancel suggestions")).toBeTruthy());
		fireEvent.click(button("Cancel suggestions"));
		expect(api.mock.calls[0][3].aborted).toBe(true);
		expect(document.body.textContent).toBe("");
		expect(save).not.toHaveBeenCalled();
	});

	it("lets users skip a group, edit a canonical name and persist selected merges", async () => {
		const { save, plugin } = setup();
		await ready();
		const checks = document.querySelectorAll<HTMLInputElement>(
			'input[type="checkbox"]',
		);
		fireEvent.click(checks[1]);
		const input =
			document.querySelector<HTMLInputElement>('input[type="text"]')!;
		fireEvent.input(input, {
			target: { value: "artificial-intelligence" },
		});
		fireEvent.click(button("Apply 1 merges"));
		await waitFor(() =>
			expect(document.body.textContent).toContain(
				"Normalization saved. Updated 1 sessions.",
			),
		);
		expect(plugin.sessionState!.getSnapshot().sessions[0].tags).toEqual([
			"artificial-intelligence",
			"keep",
		]);
		expect(plugin.sessionState!.getSnapshot().sessions[1].tags).toEqual([
			"Research Notes",
			"research-notes",
		]);
		expect(save).toHaveBeenCalled();
	});
	it("shows validation at the field review and disables applying invalid names", async () => {
		setup();
		await ready();
		fireEvent.input(document.querySelector('input[type="text"]')!, {
			target: { value: "" },
		});
		expect(button("Apply").disabled).toBe(true);
		expect(document.body.textContent).toContain("1–32 characters");
	});
	it("never applies model suggestions until the user selects a group", async () => {
		const { api } = setup();
		await ready();
		fireEvent.click(button("Suggest related tags"));
		await waitFor(() =>
			expect(document.body.textContent).toContain("Suggestions ready"),
		);
		expect(api).toHaveBeenCalledTimes(1);
		const checkbox = document.querySelector<HTMLInputElement>(
			'input[type="checkbox"]',
		)!;
		expect(checkbox.checked).toBe(false);
		fireEvent.click(checkbox);
		expect(button("Apply").disabled).toBe(false);
	});
	it("refuses a stale plan and rescans current shared tags", async () => {
		const { plugin } = setup();
		await ready();
		plugin.sessionState!.updateMetadata("a", { tags: ["AI", "new"] });
		fireEvent.click(button("Apply"));
		await waitFor(() =>
			expect(document.body.textContent).toContain(
				"Rescan tags before applying",
			),
		);
		fireEvent.click(button("Rescan tags"));
		await waitFor(() =>
			expect(document.body.textContent).not.toContain(
				"Rescan tags before applying",
			),
		);
		expect(plugin.sessionState!.getSnapshot().sessions[0].tags).toEqual([
			"AI",
			"new",
		]);
		await plugin.sessionState!.flush();
	});
	it("provides a retry after a save failure", async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error("disk full"))
			.mockResolvedValue(undefined);
		setup(save);
		await ready();
		fireEvent.click(button("Apply"));
		await waitFor(() => expect(button("Retry save")).toBeTruthy());
		expect(button("Apply").disabled).toBe(true);
		fireEvent.click(button("Retry save"));
		await waitFor(() =>
			expect(document.body.textContent).toContain(
				"Normalized tags saved.",
			),
		);
		expect(save).toHaveBeenCalledTimes(2);
	});
});
