export class MarkdownView {
	file = null;
}

export class Notice {
	constructor(public message: string) {}
}

export class TFile {
	basename = "";
	path = "";
}

export class WorkspaceLeaf {
	view: any = null;
}
