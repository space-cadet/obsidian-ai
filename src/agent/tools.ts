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
			.describe(
				'Note name or path, e.g. "Project Notes" or "Folder/Project Notes"',
			),
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
			.describe('Note name or path, e.g. "Meeting Summaries/2026-05-03"'),
		content: z.string().describe("Initial note content"),
	}),
});

export const createNotesTool = t({
	description:
		"Create multiple new notes in one approved operation. Use this instead of repeated create_note calls when the user asks for several notes or a large set of files. " +
		"This tool never overwrites existing notes: paths that already exist are skipped and reported while other requested notes are created. Maximum 100 notes per call.",
	inputSchema: z.object({
		notes: z
			.array(
				z.object({
					path: z
						.string()
						.describe('New note path, e.g. "Chinese/Verbs/ai.md"'),
					content: z
						.string()
						.describe("Initial content for this note"),
				}),
			)
			.min(2)
			.max(100)
			.describe("The new notes to create"),
	}),
});

export const patchNoteTool = t({
	description:
		"Find and replace text inside an existing note. " +
		"Use for small, precise edits — fixing a word, updating a link, or changing a date. " +
		"Only replaces the first match unless replace_all is true.",
	inputSchema: z.object({
		path: z.string().describe('Note name or path, e.g. "Project Notes"'),
		search: z
			.string()
			.describe(
				"Exact text to find. Must match literally (case-sensitive).",
			),
		replace: z
			.string()
			.describe("Text to insert in place of the search string."),
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
		"Search for notes in the vault by name or path. " +
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
			.describe("Sort results by name, modified date, or created date."),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe(
				"Maximum number of results to return (default 20, max 100).",
			),
		folder: z
			.string()
			.optional()
			.describe(
				'Restrict search to a specific folder path, e.g. "Meeting Notes"',
			),
	}),
});

export const listNotesTool = t({
	description:
		"List notes in the vault, optionally filtered by folder. " +
		"Use this when the user asks to browse, list, or show notes — especially when no specific search query is given. " +
		"Returns a formatted list with metadata. Also shows subfolders if present.",
	inputSchema: z.object({
		folder: z
			.string()
			.optional()
			.describe(
				"Folder path to list notes from. Omit to list all notes in the vault.",
			),
		sort_by: z
			.enum(["name", "modified", "created"])
			.optional()
			.default("name")
			.describe("Sort results by name, modified date, or created date."),
		limit: z
			.number()
			.optional()
			.default(30)
			.describe(
				"Maximum number of results to return (default 30, max 100).",
			),
		include_subfolders: z
			.boolean()
			.optional()
			.default(true)
			.describe(
				"Whether to include subfolder names in the result (default true).",
			),
		depth: z
			.number()
			.optional()
			.default(1)
			.describe(
				"How many levels of subfolders to show (default 1, max 3).",
			),
	}),
});

export const getNoteMetadataTool = t({
	description:
		"Get detailed metadata about a specific note — file size, creation date, modification date, word count, etc. " +
		"Use this when the user asks about note properties, recent changes, or file statistics.",
	inputSchema: z.object({
		path: z.string().describe('Note name or path, e.g. "Project Notes"'),
	}),
});

export const createFolderTool = t({
	description:
		"Create a new folder in the Obsidian vault. " +
		"Use when the user asks to create a folder, directory, or organize notes into a new folder.",
	inputSchema: z.object({
		path: z
			.string()
			.describe(
				'Folder path to create, e.g. "Research/Papers" or "Meeting Notes/2026"',
			),
	}),
});

export const moveNoteTool = t({
	description:
		"Move or rename a note in the vault. " +
		"Use when the user asks to move a note to a different folder, or rename it. " +
		"If the destination folder does not exist, it will be created automatically.",
	inputSchema: z.object({
		path: z
			.string()
			.describe(
				'Current note name or path, e.g. "Project Notes" or "Old/Project Notes"',
			),
		new_path: z
			.string()
			.describe(
				'New destination path, e.g. "Research/Project Notes" or "Project Notes v2"',
			),
	}),
});

export const deleteNoteTool = t({
	description:
		"Delete a note from the vault. " +
		"Use when the user explicitly asks to delete, remove, or trash a note. " +
		"Returns an error if the note does not exist.",
	inputSchema: z.object({
		path: z
			.string()
			.describe('Note name or path to delete, e.g. "Draft Notes"'),
	}),
});

export const countNotesTool = t({
	description:
		"Count notes in a folder or the entire vault. " +
		"Use when the user asks how many notes exist, how large a folder is, or for vault statistics. " +
		"Returns total count, including notes not shown by list_notes due to limit.",
	inputSchema: z.object({
		folder: z
			.string()
			.optional()
			.describe(
				"Folder path to count notes in. Omit to count all notes in the vault.",
			),
	}),
});

export const listFoldersTool = t({
	description:
		"List folders in the vault. " +
		"Use when the user asks about vault structure, what folders exist, or where to place notes. " +
		"Returns a tree of folder paths.",
	inputSchema: z.object({
		path: z
			.string()
			.optional()
			.describe(
				"Optional parent folder to list subfolders from. Omit to list top-level folders.",
			),
	}),
});

export const searchWebTool = t({
	description:
		"Search the web for current information. " +
		"Use when the user asks about recent events, news, facts you may not know, or anything requiring up-to-date information from the internet. " +
		"Returns a list of search results with title, URL, and snippet for each result.",
	inputSchema: z.object({
		query: z
			.string()
			.describe(
				"The search query string. Be specific and include key terms for better results.",
			),
		limit: z
			.number()
			.optional()
			.default(5)
			.describe(
				"Maximum number of results to return (default 5, max 20).",
			),
	}),
});

export const createMemoryTool = t({
	description:
		"Create a persistent memory about the user, their preferences, " +
		"projects, or insights from the conversation. " +
		"Use when the user shares something worth remembering for future sessions. " +
		"Examples: 'I prefer Julia over Python', 'My QHE paper is due next month', " +
		"'I have two children', 'I work on loop quantum gravity'. " +
		"Be specific and concise. Include dates when relevant.",
	inputSchema: z.object({
		category: z
			.enum([
				"user_fact",
				"project",
				"preference",
				"insight",
				"reference",
			])
			.describe(
				"user_fact = personal info about user; " +
					"project = ongoing work/project; " +
					"preference = likes/dislikes/work style; " +
					"insight = interesting realization; " +
					"reference = paper/book/link worth remembering",
			),
		content: z
			.string()
			.describe(
				"The memory content — specific, concise, future-readable",
			),
		tags: z
			.array(z.string())
			.optional()
			.describe("Tags for filtering, e.g. ['physics', 'qhe', 'family']"),
	}),
});

export const updateMemoryTool = t({
	description:
		"Update an existing memory entry by its ID. " +
		"Use when the user wants to correct, expand, or reclassify a memory. " +
		"Only the fields you provide will be changed.",
	inputSchema: z.object({
		id: z.string().describe("The memory entry ID, e.g. 'a1b2c3d4'"),
		category: z
			.enum([
				"user_fact",
				"project",
				"preference",
				"insight",
				"reference",
			])
			.optional()
			.describe("New category, if changing"),
		content: z.string().optional().describe("New content, if changing"),
		tags: z
			.array(z.string())
			.optional()
			.describe("New tags, if changing (replaces existing tags)"),
	}),
});

export const deleteMemoryTool = t({
	description:
		"Delete a memory entry by its ID. " +
		"Use when the user wants to forget something or remove an incorrect memory.",
	inputSchema: z.object({
		id: z.string().describe("The memory entry ID to delete"),
	}),
});

export const listMemoriesTool = t({
	description:
		"List stored memories, optionally filtered by category or tag. " +
		"Use when the user asks 'what do you remember about me' or wants to review memories.",
	inputSchema: z.object({
		category: z
			.enum([
				"user_fact",
				"project",
				"preference",
				"insight",
				"reference",
			])
			.optional()
			.describe("Filter by category"),
		tag: z.string().optional().describe("Filter by tag (e.g. 'physics')"),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe("Maximum entries to return (default 20)"),
	}),
});

export const searchMemoriesTool = t({
	description:
		"Search memories by keyword across content and tags. " +
		"Use when the user asks about something specific they may have told you before.",
	inputSchema: z.object({
		query: z
			.string()
			.describe("Search query — keywords to find in memories"),
		limit: z
			.number()
			.optional()
			.default(10)
			.describe("Maximum results (default 10)"),
	}),
});

export const readMemoryAuditTool = t({
	description:
		"Read the memory audit log — a record of create, update, and delete operations. " +
		"Use when the user asks about memory history, what was changed, or to debug memory issues. " +
		"Requires the memory audit tool to be enabled in Settings.",
	inputSchema: z.object({
		limit: z
			.number()
			.optional()
			.default(20)
			.describe("Maximum audit entries to return (default 20)"),
	}),
});

export const searchPastSessionsTool = t({
	description:
		"Search past chat sessions by topic, keyword, or content. " +
		"Use when the user references something from a previous conversation, " +
		"asks 'what did we discuss about X', or when you need historical context.",
	inputSchema: z.object({
		query: z
			.string()
			.describe(
				"Search query — keywords or topic to find in past sessions",
			),
		limit: z
			.number()
			.optional()
			.default(5)
			.describe("Maximum number of results to return (default 5)"),
	}),
});

export const noteTools = {
	read_note: readNoteTool,
	edit_note: editNoteTool,
	append_to_note: appendToNoteTool,
	create_note: createNoteTool,
	create_notes: createNotesTool,
	patch_note: patchNoteTool,
	edit_section: editSectionTool,
	search_notes: searchNotesTool,
	list_notes: listNotesTool,
	count_notes: countNotesTool,
	get_note_metadata: getNoteMetadataTool,
	create_folder: createFolderTool,
	move_note: moveNoteTool,
	delete_note: deleteNoteTool,
	list_folders: listFoldersTool,
	search_web: searchWebTool,
	create_memory: createMemoryTool,
	update_memory: updateMemoryTool,
	delete_memory: deleteMemoryTool,
	list_memories: listMemoriesTool,
	search_memories: searchMemoriesTool,
	read_memory_audit: readMemoryAuditTool,
	search_past_sessions: searchPastSessionsTool,
};
