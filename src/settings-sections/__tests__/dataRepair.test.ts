import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/dom";
import { renderDataRepair } from "../dataRepair";
import {
	previewDataRepair,
	scheduleDataRepair,
	cancelDataRepair,
} from "../../diagnostics/dataRepair";
vi.mock("../../diagnostics/dataRepair", () => ({
	previewDataRepair: vi.fn(),
	scheduleDataRepair: vi.fn(),
	cancelDataRepair: vi.fn(),
}));
vi.mock("obsidian", () => ({
	Notice: class {},
	Setting: class {
		constructor(private container: HTMLElement) {}
		setName() {
			return this;
		}
		setDesc() {
			return this;
		}
		addButton(cb: (btn: any) => void) {
			const el = document.createElement("button");
			this.container.append(el);
			const btn = {
				setButtonText(text: string) {
					el.textContent = text;
					return btn;
				},
				setDisabled(value: boolean) {
					el.disabled = value;
					return btn;
				},
				onClick(fn: () => void) {
					el.addEventListener("click", fn);
					return btn;
				},
			};
			cb(btn);
			return this;
		}
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	Object.assign(HTMLElement.prototype, {
		createEl(this: HTMLElement, tag: string, opts: any = {}) {
			const el = document.createElement(tag);
			el.textContent = opts.text ?? "";
			this.append(el);
			return el;
		},
		createDiv(this: HTMLElement) {
			const el = document.createElement("div");
			this.append(el);
			return el;
		},
		empty(this: HTMLElement) {
			this.replaceChildren();
		},
		setCssStyles() {},
	});
});
afterEach(() => {
	for (const name of ["createEl", "createDiv", "empty", "setCssStyles"])
		delete (HTMLElement.prototype as any)[name];
});
const plan = {
	version: 1,
	createdAt: "now",
	changes: [
		{
			path: "sessions/s.jsonl",
			beforeHash: "a",
			afterHash: "b",
			description: "Remove identical duplicates",
		},
	],
	skipped: [
		{ path: "sessions/conflict.jsonl", reason: "Conflicting content" },
	],
} as any;
function setup(result?: string) {
	const container = document.createElement("div");
	const adapter = {
		exists: vi.fn(
			async (p: string) =>
				!!result && p.endsWith("health-repair-result.json"),
		),
		stat: vi.fn(async () => ({ size: 100 })),
		read: vi.fn(async () => JSON.stringify({ message: result })),
	};
	const app = { vault: { adapter, configDir: ".custom" } } as any;
	renderDataRepair(container, app, "chat-lab");
	const buttons = container.querySelectorAll("button");
	return {
		container,
		adapter,
		preview: buttons[0],
		schedule: buttons[1],
		cancel: buttons[2],
	};
}
describe("repair controls", () => {
	it("requires preview then explicit scheduling; neither initialization nor preview applies changes", async () => {
		vi.mocked(previewDataRepair).mockResolvedValue(plan);
		vi.mocked(scheduleDataRepair).mockResolvedValue();
		const { container, adapter, preview, schedule, cancel } = setup();
		expect(previewDataRepair).not.toHaveBeenCalled();
		expect(schedule.disabled).toBe(true);
		preview.click();
		await waitFor(() => expect(schedule.disabled).toBe(false));
		expect(container.textContent).toContain("Remove identical duplicates");
		expect(container.textContent).toContain("Conflicting content");
		expect(scheduleDataRepair).not.toHaveBeenCalled();
		schedule.click();
		await waitFor(() =>
			expect(scheduleDataRepair).toHaveBeenCalledWith(
				adapter,
				".custom/plugins/chat-lab",
				plan,
			),
		);
		await waitFor(() =>
			expect(container.textContent).toContain("Repairs scheduled"),
		);
		expect(schedule.disabled).toBe(true);
		cancel.click();
		await waitFor(() =>
			expect(cancelDataRepair).toHaveBeenCalledWith(
				adapter,
				".custom/plugins/chat-lab",
			),
		);
	});
	it("keeps scheduling disabled if no safe repairs exist", async () => {
		vi.mocked(previewDataRepair).mockResolvedValue({
			...plan,
			changes: [],
		});
		const { preview, schedule, container } = setup();
		preview.click();
		await waitFor(() =>
			expect(container.textContent).toContain(
				"0 file(s) can be repaired",
			),
		);
		expect(schedule.disabled).toBe(true);
	});
	it("shows a changed-file failure and requires another preview", async () => {
		vi.mocked(previewDataRepair).mockResolvedValue(plan);
		vi.mocked(scheduleDataRepair).mockRejectedValue(
			new Error("Files changed since the preview. Preview again."),
		);
		const { preview, schedule, container } = setup();
		preview.click();
		await waitFor(() => expect(schedule.disabled).toBe(false));
		schedule.click();
		await waitFor(() =>
			expect(container.textContent).toContain("Files changed since"),
		);
		expect(schedule.disabled).toBe(true);
	});
	it("displays the persisted repair outcome after restart", async () => {
		const { container } = setup("Repaired 2 files. Originals preserved.");
		await waitFor(() =>
			expect(container.textContent).toContain("Repaired 2 files"),
		);
	});
});
