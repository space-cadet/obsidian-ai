import { ContextItem } from "../types";

export function contextItemKey(item: ContextItem): string {
	switch (item.type) {
		case "note":
			return `note:${item.path}`;
		case "folder":
			return `folder:${item.path}`;
		case "tag":
			return `tag:${item.tag}`;
		case "active-note":
		default:
			return `active:${item.id}`;
	}
}

export function sameContextItems(a: ContextItem[], b: ContextItem[]): boolean {
	if (a.length !== b.length) return false;
	return a.every(
		(item, index) => contextItemKey(item) === contextItemKey(b[index]),
	);
}
