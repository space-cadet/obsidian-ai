import { describe, it, expect } from "vitest";
import { highlightMentions } from "../MessageBubble";
import type { ContextItem } from "../../types";

const note = (name: string, path = ""): ContextItem => ({
	id: name,
	type: "note",
	name,
	path: path || `${name}.md`,
} as ContextItem);

const pillTexts = (container: HTMLElement): string[] =>
	Array.from(container.querySelectorAll(".chat-mention-pill")).map(
		(el) => el.textContent,
	);

describe("highlightMentions", () => {
	it("pills every occurrence when multiple names share one text node", () => {
		// Both names plain in a single paragraph — e.g. wikilinks that the
		// renderer did not split into anchors.
		const el = document.createElement("div");
		el.innerHTML =
			"<p>listed in [[Chinese Notes]] and a whole conversation in [[New Shoes]].</p>";
		highlightMentions(el, [note("Chinese Notes"), note("New Shoes")]);
		expect(pillTexts(el)).toEqual(["Chinese Notes", "New Shoes"]);
	});

	it("pills wikilinks rendered as separate anchors", () => {
		const el = document.createElement("div");
		el.innerHTML =
			"<p>listed in <a class='internal-link'>Chinese Notes</a> and in <a class='internal-link'>New Shoes</a>.</p>";
		highlightMentions(el, [note("Chinese Notes"), note("New Shoes")]);
		expect(pillTexts(el)).toEqual(["Chinese Notes", "New Shoes"]);
	});

	it("pills a plain-text mention when the sibling wikilink is anchored", () => {
		const el = document.createElement("div");
		el.innerHTML =
			"<p>listed in <a class='internal-link'>Chinese Notes</a> and in New Shoes.</p>";
		highlightMentions(el, [note("Chinese Notes"), note("New Shoes")]);
		expect(pillTexts(el)).toEqual(["Chinese Notes", "New Shoes"]);
	});

	it("pills repeated occurrences of the same name", () => {
		const el = document.createElement("div");
		el.innerHTML = "<p>Chinese Notes here and Chinese Notes again</p>";
		highlightMentions(el, [note("Chinese Notes")]);
		expect(pillTexts(el)).toEqual(["Chinese Notes", "Chinese Notes"]);
	});

	it("prefers the longest name on overlap", () => {
		const el = document.createElement("div");
		el.innerHTML = "<p>see Chinese Notes today</p>";
		highlightMentions(el, [note("Chinese Notes"), note("Notes")]);
		expect(pillTexts(el)).toEqual(["Chinese Notes"]);
	});

	it("leaves content untouched when nothing matches", () => {
		const el = document.createElement("div");
		el.innerHTML = "<p>nothing to see here</p>";
		highlightMentions(el, [note("Chinese Notes")]);
		expect(pillTexts(el)).toEqual([]);
		expect(el.textContent).toBe("nothing to see here");
	});

	it("is a no-op for empty context items", () => {
		const el = document.createElement("div");
		el.innerHTML = "<p>Chinese Notes</p>";
		highlightMentions(el, []);
		expect(pillTexts(el)).toEqual([]);
	});
});
