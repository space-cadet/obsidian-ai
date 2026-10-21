import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/dom";
import { renderDataHealth } from "../dataHealth";
import { checkDataHealth } from "../../diagnostics/dataHealth";
const { repairModalMock } = vi.hoisted(() => ({
	repairModalMock: { open: vi.fn(), args: [] as unknown[] },
}));
vi.mock("../../diagnostics/dataHealth", () => ({ checkDataHealth: vi.fn() }));
vi.mock("../../modals/DataRepairModal", () => ({
	DataRepairModal: class {
		constructor(...args: unknown[]) {
			repairModalMock.args = args;
		}
		open() {
			repairModalMock.open();
		}
	},
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
const report = {
	startedAt: "now",
	finishedAt: "now",
	filesChecked: 3,
	filesSkipped: 0,
	counts: { error: 0, warning: 1, info: 0 },
	findings: [
		{
			severity: "warning",
			code: "missing",
			path: "sessions/test.jsonl",
			message: "Missing transcript",
			suggestion: "Check backups",
		},
	],
	omittedFindings: 0,
	limitations: ["Read-only snapshot"],
} as any;
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
function setup() {
	const container = document.createElement("div");
	const app = {
		vault: {
			adapter: {},
			configDir: ".custom",
			create: vi.fn().mockResolvedValue({}),
		},
	} as any;
	renderDataHealth(container, app, "chat-lab");
	const buttons = container.querySelectorAll("button");
	const run = buttons[0];
	const save = buttons[1];
	return { container, app, run, save };
}
describe("data health controls", () => {
	it("opens the repair review modal on request", () => {
		const { app, container } = setup();
		repairModalMock.open.mockClear();
		container.querySelectorAll("button")[2].click();
		expect(repairModalMock.args).toEqual([app, "chat-lab", undefined]);
		expect(repairModalMock.open).toHaveBeenCalledOnce();
	});

	it("scans only on request and exports only on an explicit export click", async () => {
		vi.mocked(checkDataHealth).mockResolvedValue(report);
		const { container, app, run, save } = setup();
		expect(checkDataHealth).not.toHaveBeenCalled();
		expect(save.disabled).toBe(true);
		run.click();
		await waitFor(() => expect(save.disabled).toBe(false));
		expect(checkDataHealth).toHaveBeenCalledWith(
			app.vault.adapter,
			".custom/plugins/chat-lab",
			"chat-lab",
			expect.any(Function),
		);
		expect(container.textContent).toContain("Missing transcript");
		expect(container.textContent).toContain("Check backups");
		expect(app.vault.create).not.toHaveBeenCalled();
		save.click();
		await waitFor(() => expect(app.vault.create).toHaveBeenCalledTimes(1));
		expect(JSON.parse(app.vault.create.mock.calls[0][1])).toEqual(report);
	});
	it("prevents concurrent scans and restores controls after a failure", async () => {
		let reject!: (reason: Error) => void;
		vi.mocked(checkDataHealth).mockReturnValue(
			new Promise((_, fail) => {
				reject = fail;
			}),
		);
		const { container, run, save, app } = setup();
		run.click();
		run.click();
		expect(run.disabled).toBe(true);
		expect(checkDataHealth).toHaveBeenCalledTimes(1);
		reject(new Error("private details"));
		await waitFor(() => expect(run.disabled).toBe(false));
		expect(save.disabled).toBe(true);
		expect(container.textContent).toContain("Check could not finish");
		expect(container.textContent).not.toContain("private details");
		expect(app.vault.create).not.toHaveBeenCalled();
	});
});
