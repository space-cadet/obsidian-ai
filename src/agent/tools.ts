import { tool } from "ai";
import { z } from "zod";

// Cast tool() to any to bypass AI SDK v6's deeply nested generic type inference
// which causes TypeScript to hang / OOM. Runtime behavior is unchanged.
const t = tool as any;

export const readNoteTool = t({
	description:
		"Read the full content of an Obsidian note by its name or path. " +
		"Use this before editing to understand the current content.",
	inputSchema: z.object({
		path: z
			.string()
			.describe('Note name or path, e.g. "Project Notes" or "Folder/Project Notes"'),
	}),
});

export const editNoteTool = t({
	description:
		"Overwrite the entire content of an existing note. " +
		"Only use when the user explicitly asks to rewrite, edit, or replace a note. " +
		"Return the complete new content — do not use diff syntax.",
	inputSchema: z.object({
		path: z.string().describe('Note name or path, e.g. "Project Notes"'),
		content: z.string().describe("The complete new note content"),
	}),
});

export const appendToNoteTool = t({
	description:
		"Append content to the end of an existing note. " +
		"Use for adding summaries, logs, or follow-ups without changing existing content.",
	inputSchema: z.object({
		path: z.string().describe('Note name or path, e.g. "Project Notes"'),
		content: z.string().describe("Content to append"),
	}),
});

export const createNoteTool = t({
	description:
		"Create a new note in the vault with the given content. " +
		"Use when the user asks to create a new document, summary, or draft.",
	inputSchema: z.object({
		path: z
			.string()
			.describe(
				'Note name or path, e.g. "Meeting Summaries/2026-05-03"',
			),
		content: z.string().describe("Initial note content"),
	}),
});

export const patchNoteTool = t({
	description:
		"Find and replace text inside an existing note. " +
		"Use for small, precise edits — fixing a word, updating a link, or changing a date. " +
		"Only replaces the first match unless replace_all is true.",
	inputSchema: z.object({
		path: z.string().describe('Note name or path, e.g. "Project Notes"'),
		search: z.string().describe("Exact text to find. Must match literally (case-sensitive)."),
		replace: z.string().describe("Text to insert in place of the search string."),
		replace_all: z
			.boolean()
			.optional()
			.describe("Replace every occurrence instead of just the first."),
	}),
});

export const editSectionTool = t({
	description:
		"Rewrite a specific section of a note identified by its heading. " +
		"Use when the user wants to change content under a heading without touching the rest of the note. " +
		"The new_content must include the heading line itself.",
	inputSchema: z.object({
		path: z.string().describe('Note name or path, e.g. "Project Notes"'),
		section_heading: z
			.string()
			.describe(
				'The heading text to target (without #), e.g. "Morning Routine"',
			),
		new_content: z
			.string()
			.describe(
				"The complete replacement text for this section, including the heading line.",
			),
	}),
});

export const searchNotesTool = t({
	description:
		"Search for notes in the vault by name, path, or content. " +
		"Use this when the user asks to find, list, or search for notes without providing specific context. " +
		"Returns a list of matching note paths with metadata.",
	inputSchema: z.object({
		query: z
			.string()
			.describe(
				'Search query (case-insensitive substring match), e.g. "meeting" or "daily". Use empty string "" to list all notes.',
			),
		sort_by: z
			.enum(["name", "modified", "created"])
			.optional()
			.default("name")
			.describe('Sort results by name, modified date, or created date.'),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe('Maximum number of results to return (default 20, max 100).'),
		folder: z
			.string()
			.optional()
			.describe('Restrict search to a specific folder path, e.g. "Meeting Notes"'),
		search_content: z
			.boolean()
			.optional()
			.default(false)
			.describe('Also search inside note bodies, not just filenames.'),
	}),
});

export const listNotesTool = t({
	description:
		"List notes in the vault, optionally filtered by folder. " +
		"Use this when the user asks to browse, list, or show notes — especially when no specific search query is given. " +
		"Returns a formatted list with metadata.",
	inputSchema: z.object({
		folder: z
			.string()
			.optional()
			.describe('Folder path to list notes from. Omit to list all notes in the vault.'),
		sort_by: z
			.enum(["name", "modified", "created"])
			.optional()
			.default("name")
			.describe('Sort results by name, modified date, or created date.'),
		limit: z
			.number()
			.optional()
			.default(30)
			.describe('Maximum number of results to return (default 30, max 100).'),
	}),
});

export const getNoteMetadataTool = t({
	description:
		"Get detailed metadata about a specific note — file size, creation date, modification date, word count, etc. " +
		"Use this when the user asks about note properties, recent changes, or file statistics.",
	inputSchema: z.object({
		path: z
			.string()
			.describe('Note name or path, e.g. "Project Notes"'),
	}),
});

export const noteTools = {
	read_note: readNoteTool,
	edit_note: editNoteTool,
	append_to_note: appendToNoteTool,
	create_note: createNoteTool,
	patch_note: patchNoteTool,
	edit_section: editSectionTool,
	search_notes: searchNotesTool,
	list_notes: listNotesTool,
	get_note_metadata: getNoteMetadataTool,
};
