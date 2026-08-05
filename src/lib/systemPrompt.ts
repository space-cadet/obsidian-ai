import { ContextItem } from "../types";
import { SlashCommand } from "./slashCommand";
import { PersonaLoader } from "../intelligence/PersonaLoader";

export async function buildSystemPrompt(
	contextItems: ContextItem[],
	personaLoader: PersonaLoader | null,
	slashCmd?: SlashCommand,
	toolsEnabled = false,
): Promise<string> {
	let identityContext = "";
	if (personaLoader) {
		try {
			identityContext = await personaLoader.loadFullContext();
		} catch {
			// Graceful fallback if persona loading fails
		}
	}

	let prompt = "";
	if (identityContext) {
		prompt = identityContext + "\n\n";
	}
	prompt += "You are a helpful assistant integrated into an Obsidian note-taking app.";

	// ── System Context (date, time, platform) ──
	const now = new Date();
	const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const platformInfo = typeof navigator !== "undefined" 
		? `Platform: ${navigator.platform || "unknown"}` 
		: "";
	
	prompt += `\n\n[System Context]`;
	prompt += `\n- Current date: ${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
	prompt += `\n- Current time: ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
	prompt += `\n- Timezone: ${tz}`;
	if (platformInfo) prompt += `\n- ${platformInfo}`;
	prompt += `\n- Locale: ${typeof navigator !== "undefined" ? navigator.language : "unknown"}`;
	const hasActiveNote = contextItems.some((i) => i.type === "active-note");

	if (toolsEnabled) {
		prompt +=
			"\n\nYou have access to the following tools for managing Obsidian notes:" +
			"\n- read_note: Read the full content of a note. Use this before editing to understand current content." +
			"\n- edit_note: Overwrite the entire content of a note. Provide COMPLETE new content." +
			"\n- append_to_note: Add content to the end of a note without changing existing content." +
			"\n- create_note: Create a new note in the vault." +
			"\n- create_notes: Create 2–100 new notes in one approved operation; never overwrites existing notes. Use this for large sets instead of repeatedly calling create_note." +
			"\n- patch_note: Find and replace text inside a note (small precise edits)." +
			"\n- edit_section: Rewrite content under a specific heading." +
			"\n- search_notes: Search for notes by filename or path. Use sort_by=name|modified|created, limit, folder, and search_content params." +
			"\n- list_notes: Browse notes in the vault or a folder. Use sort_by=name|modified|created, limit, and include_subfolders (default true) params. Shows subfolders alongside files." +
			"\n- count_notes: Count files in a folder or the entire vault. Returns total files, markdown files, direct files, and subfolder counts. Use when the user asks how many notes/files exist or for folder statistics." +
			"\n- get_note_metadata: Get file stats (size, dates, word count) for a specific note." +
			"\n- create_folder: Create a new folder in the vault." +
			"\n- move_note: Move or rename a note to a new folder or name. Creates parent folders if needed." +
			"\n- delete_note: Delete a note from the vault." +
			"\n- list_folders: List folders in the vault. Use to understand vault structure." +
			"\n- search_web: Search the web for current information. Use when the user asks about recent events, news, or facts that may have changed since your training data." +
			"\n- search_past_sessions: Search the user's saved previous chat conversations by topic or keywords. This is for chat history, not vault notes." +
			"\n\nWhen the user asks to find, list, or search for notes, ALWAYS use search_notes or list_notes first." +
			" When the user asks whether you can search past sessions, chats, conversations, or what you discussed previously, say that you can search saved chat history and call search_past_sessions with the relevant keywords." +
			" Do not say you cannot search — you have the search_notes and list_notes tools." +
			" Before editing a note you are unfamiliar with, use read_note to see its current content." +
			"\n\nImportant: When using edit_note, provide the COMPLETE new note content. Do not use diff syntax or markdown code blocks." +
			"\n\nFor moving notes: use move_note(path, new_path). Parent folders are created automatically if needed." +
			"\nFor multiple new notes: use one create_notes call with all note paths and contents. Do not claim to batch or parallelize work with create_note; it only creates one note." +
			"\nFor creating folders: use create_folder(path). Then use move_note to place notes inside.";
	}

	if (slashCmd) {
		switch (slashCmd.command) {
			case "edit":
				prompt += `\n\nThe user wants to edit the note "${slashCmd.target}". Return ONLY the complete revised note content. Do not wrap it in markdown code blocks or add explanations.`;
				break;
			case "create":
				prompt += `\n\nThe user wants to create a new note named "${slashCmd.target}". Return the complete note content.`;
				break;
			case "append":
				prompt += `\n\nThe user wants to append to the note "${slashCmd.target}". Return only the new content to append.`;
				break;
		}
	} else if (hasActiveNote) {
		prompt +=
			"\n\nThe active note is included in context. When the user asks you to edit, rewrite, or improve the note, return ONLY the complete revised note content. Do not wrap it in markdown code blocks or add explanations.";
	}
	return prompt;
}
