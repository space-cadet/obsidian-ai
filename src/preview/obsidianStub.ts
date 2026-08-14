export const setIcon = (target: HTMLElement, icon: string): void => {
	target.textContent = "•";
	target.title = icon;
	target.style.overflow = "hidden";
	target.style.fontSize = "12px";
	target.setAttribute("aria-hidden", "true");
};

export class Menu {
	addItem(callback: (item: any) => void): this { callback({ setTitle: () => this, setIcon: () => this, onClick: () => this }); return this; }
	addSeparator(): this { return this; }
	showAtMouseEvent(): void {}
}

export class Notice {
	constructor(public message: string) { console.info("[Preview notice]", message); }
}

export class TFile {
	constructor(public path = "fixture.md") {}
}

export class TFolder {
	constructor(public path = "") {}
}

export const Platform = { isMobile: false };
