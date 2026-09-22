import { describe, it, expect, beforeAll, vi } from "vitest";

// Polyfill Obsidian's HTMLElement extensions — the obsidian mock only stubs
// Modal/Notice/Menu/Setting, not the DOM helpers used by the modal.
beforeAll(() => {
	const hp = HTMLElement.prototype as any;
	if (!hp.createDiv) {
		hp.createDiv = function (cls?: string, cb?: (el: HTMLElement) => void) {
			const el = document.createElement("div");
			if (cls) el.className = cls;
			if (cb) cb(el);
			this.appendChild(el);
			return el;
		};
	}
	if (!hp.createEl) {
		hp.createEl = function (
			tag: string,
			attrsOrCb?: Record<string, string> | ((el: HTMLElement) => void),
			cb?: (el: HTMLElement) => void,
		) {
			const el = document.createElement(tag);
			let callback = cb;
			if (typeof attrsOrCb === "function") callback = attrsOrCb;
			else if (attrsOrCb && typeof attrsOrCb === "object") {
				const a = attrsOrCb;
				if (a.cls) el.className = a.cls;
				if (a.text != null) el.textContent = a.text;
				if (a.value != null) el.setAttribute("value", a.value);
			}
			if (callback) callback(el);
			this.appendChild(el);
			return el;
		};
	}
	if (!hp.createSpan) {
		hp.createSpan = function (cls?: string) {
			const el = document.createElement("span");
			if (cls) el.className = cls;
			this.appendChild(el);
			return el;
		};
	}
	if (!hp.setText) hp.setText = function (t: string) { this.textContent = t; return this; };
	if (!hp.empty) hp.empty = function () { this.innerHTML = ""; return this; };
	if (!hp.addClass) hp.addClass = function (...c: string[]) { this.classList.add(...c); return this; };
	if (!hp.removeClass) hp.removeClass = function (...c: string[]) { this.classList.remove(...c); return this; };
	if (!hp.setCssProps) hp.setCssProps = function (props: Record<string, string>) { Object.assign(this.style, props); return this; };
});

import { SyncProgressModal } from "../SyncProgressModal";
import type { SyncExamination } from "../../sync/SyncEngine";

function makeExam(overrides: Partial<SyncExamination> = {}): SyncExamination {
	return {
		localCount: 207,
		remoteCount: 207,
		upload: [],
		uploadBytes: 0,
		download: [{ id: "a", title: "Alpha" }],
		downloadBytes: 1024,
		conflicts: [],
		unchanged: 206,
		...overrides,
	};
}

type ModalOptions = ConstructorParameters<typeof SyncProgressModal>[2];

function openModal(options?: ModalOptions) {
	const app = {} as any;
	const modal = new SyncProgressModal(app, 0, options);
	(modal as any).contentEl = document.createElement("div");
	modal.onOpen();
	return modal;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("SyncProgressModal examine phase", () => {
	it("auto-runs onExamine and renders counts + rows", async () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam());
		const modal = openModal({ onExamine });
		await flush();
		expect(onExamine).toHaveBeenCalledWith("both");
		const text = (modal as any).contentEl.textContent as string;
		expect(text).toContain("207");
		expect(text).toContain("to download");
		expect(text).toContain("Alpha");
	});

	it("renders the progress phase directly when no onExamine is given", () => {
		const modal = openModal();
		const text = (modal as any).contentEl.textContent as string;
		expect(text).toContain("Syncing");
		expect(text).toContain("Activity Log");
	});

	it("caps the row list at 10 with a +N note", async () => {
		const download = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, title: `Row ${i}` }));
		const onExamine = vi.fn().mockResolvedValue(makeExam({ download }));
		const modal = openModal({ onExamine });
		await flush();
		const text = (modal as any).contentEl.textContent as string;
		expect(text).toContain("Row 9");
		expect(text).not.toContain("Row 10");
		expect(text).toContain("5 more");
	});

	it("shows a 'nothing to transfer' status when stores match", async () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam({ download: [], downloadBytes: 0 }));
		const modal = openModal({ onExamine });
		await flush();
		const text = (modal as any).contentEl.textContent as string;
		expect(text).toContain("nothing to transfer");
	});

	it("marks conflicts with the warn style", async () => {
		const onExamine = vi
			.fn()
			.mockResolvedValue(makeExam({ conflicts: [{ id: "c", title: "plugin-settings" }] }));
		const modal = openModal({ onExamine });
		await flush();
		const warn = (modal as any).contentEl.querySelector(".sync-exam-stat--warn");
		expect(warn).not.toBeNull();
		expect(warn.textContent).toContain("conflicts");
	});

	it("dryRunOnly hides the Sync now button", async () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam());
		const modal = openModal({ onExamine, dryRunOnly: true });
		await flush();
		expect((modal as any).syncNowBtn.classList.contains("sync-btn-hidden")).toBe(true);
		expect((modal as any).syncNowBtn.classList.contains("mod-cta")).toBe(false);
		const labels = [...(modal as any).contentEl.querySelectorAll("button")].map(
			(b: HTMLButtonElement) => b.textContent,
		);
		expect(labels).toContain("Close");
	});

	it("rebuilds the index and refreshes the examination", async () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam());
		const onRebuildIndex = vi
			.fn()
			.mockResolvedValue(
				makeExam({ download: [], downloadBytes: 0, unchanged: 207 }),
			);
		const modal = openModal({ onExamine, onRebuildIndex });
		await flush();
		const rebuild = [
			...(modal as any).contentEl.querySelectorAll("button"),
		].find(
			(button: HTMLButtonElement) =>
				button.textContent === "Rebuild index",
		) as HTMLButtonElement;
		rebuild.click();
		await flush();
		expect(onRebuildIndex).toHaveBeenCalledWith(
			"both",
			expect.any(Function),
		);
		expect((modal as any).contentEl.textContent).toContain(
			"nothing to transfer",
		);
	});

	it("shows visible progress while rebuilding the index", async () => {
		let release!: (exam: SyncExamination) => void;
		const rebuildPromise = new Promise<SyncExamination>((resolve) => {
			release = resolve;
		});
		const onRebuildIndex = vi.fn(
			(_direction: string, report?: (message: string) => void) => {
				report?.("Scanning remote sessions…");
				return rebuildPromise;
			},
		);
		const modal = openModal({
			onExamine: vi.fn().mockResolvedValue(makeExam()),
			onRebuildIndex,
		});
		await flush();
		(
			[...(modal as any).contentEl.querySelectorAll("button")].find(
				(button: HTMLButtonElement) =>
					button.textContent === "Rebuild index",
			) as HTMLButtonElement
		).click();
		await flush();
		expect((modal as any).contentEl.textContent).toContain(
			"Scanning remote sessions…",
		);
		expect((modal as any).rebuildIndexBtn.textContent).toBe("Rebuilding…");
		expect(
			(modal as any).examProgressEl.classList.contains("is-active"),
		).toBe(true);
		release(makeExam({ download: [], downloadBytes: 0 }));
		await flush();
		expect((modal as any).rebuildIndexBtn.textContent).toBe(
			"Rebuild index",
		);
	});

	it("confirm switches to progress and calls onConfirm with direction", async () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam());
		const onConfirm = vi.fn();
		const modal = openModal({ onExamine, onConfirm });
		await flush();
		(modal as any).syncNowBtn.click();
		expect(onConfirm).toHaveBeenCalledWith("both");
		expect((modal as any).phase).toBe("progress");
		expect((modal as any).contentEl.textContent).toContain("Syncing");
	});

	it("updates live counters from sync progress snapshots", async () => {
		const modal = openModal({
			onExamine: vi.fn().mockResolvedValue(makeExam()),
		});
		await flush();
		(modal as any).syncNowBtn.click();
		(modal as any).updateFromSnapshot({
			phase: "syncing",
			stage: "Downloading sessions",
			total: 4,
			completed: 2,
			uploaded: 1,
			downloaded: 1,
			deleted: 0,
			conflicts: 0,
			skipped: 0,
			elapsedMs: 1200,
		});
		expect((modal as any).sessionCountEl.textContent).toBe("2 / 4");
		expect((modal as any).summaryEl.textContent).toContain("↑1 ↓1");
		expect((modal as any).statusEl.textContent).toBe(
			"Downloading sessions",
		);
	});

	it("confirm is a no-op before examine completes", async () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam());
		const onConfirm = vi.fn();
		const modal = openModal({ onExamine, onConfirm });
		(modal as any).syncNowBtn.click();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("closing during examine calls onEarlyClose", () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam());
		const onEarlyClose = vi.fn();
		const modal = openModal({ onExamine, onEarlyClose });
		modal.onClose();
		expect(onEarlyClose).toHaveBeenCalled();
	});

	it("closing after confirm does not call onEarlyClose", async () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam());
		const onEarlyClose = vi.fn();
		const modal = openModal({ onExamine, onEarlyClose });
		await flush();
		(modal as any).syncNowBtn.click();
		modal.onClose();
		expect(onEarlyClose).not.toHaveBeenCalled();
	});

	it("changing direction re-runs examine", async () => {
		const onExamine = vi.fn().mockResolvedValue(makeExam());
		const modal = openModal({ onExamine });
		await flush();
		const select = (modal as any).examDirEl as HTMLSelectElement;
		select.value = "download";
		select.dispatchEvent(new Event("change"));
		await flush();
		expect(onExamine).toHaveBeenCalledTimes(2);
		expect(onExamine).toHaveBeenLastCalledWith("download");
	});

	it("a null examination reports not-configured", async () => {
		const onExamine = vi.fn().mockResolvedValue(null);
		const modal = openModal({ onExamine });
		await flush();
		const text = (modal as any).contentEl.textContent as string;
		expect(text).toContain("not configured");
		expect((modal as any).syncNowBtn.disabled).toBe(true);
	});
});
