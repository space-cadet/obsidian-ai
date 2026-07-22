import { App } from "obsidian";
import { FileLogger } from "../logger";

export interface PersonaLoaderDeps {
	app: App;
	manifest: { id: string };
	logger?: FileLogger;
}

const DEFAULT_PERSONA = `# AI Persona

You are a helpful research assistant integrated into Obsidian.
You help the user organize thoughts, analyze notes, and connect ideas.

## Communication Style
- Be concise. Prefer short answers unless detail is requested.
- Use wiki-links [[Note Name]] when referencing vault notes.
- When asked to edit notes, return ONLY the complete new content.

## Rules
- Before editing a note you haven't seen, read it first.
- When the user mentions something from a past conversation, use search_past_sessions.
- Create memories when the user shares personal facts, preferences, or project updates.
`;

const DEFAULT_MEMORY = `# AI Memory

Auto-generated from chat sessions. The AI may append entries here.
Feel free to edit or delete anything — it's your memory.

## Entries

`;

/**
 * Loads the AI's persistent identity (persona) and dynamic memory
 * from the plugin directory. All files live in:
 *   .obsidian/plugins/obsidian-ai/intelligence/
 */
export class PersonaLoader {
	private deps: PersonaLoaderDeps;
	private readonly intelligenceDir: string;

	constructor(deps: PersonaLoaderDeps) {
		this.deps = deps;
		this.intelligenceDir = `${deps.app.vault.configDir}/plugins/${deps.manifest.id}/intelligence`;
	}

	/** Ensure intelligence/ directory and default files exist. */
	async ensureDefaults(): Promise<void> {
		const adapter = this.deps.app.vault.adapter;

		// Create directory if missing
		try {
			await adapter.mkdir(this.intelligenceDir);
		} catch {
			// may already exist
		}

		// Create default persona.md if missing
		const personaPath = `${this.intelligenceDir}/persona.md`;
		if (!(await adapter.exists(personaPath))) {
			await adapter.write(personaPath, DEFAULT_PERSONA);
			this.deps.logger?.log("info", `Created default persona at ${personaPath}`);
		}

		// Create default memory.md if missing
		const memoryPath = `${this.intelligenceDir}/memory.md`;
		if (!(await adapter.exists(memoryPath))) {
			await adapter.write(memoryPath, DEFAULT_MEMORY);
			this.deps.logger?.log("info", `Created default memory at ${memoryPath}`);
		}
	}

	/** Read persona.md — returns content or empty string if disabled/missing. */
	async loadPersona(): Promise<string> {
		const path = `${this.intelligenceDir}/persona.md`;
		return this._readFile(path);
	}

	/** Read memory.md — returns content or empty string. Optionally truncates. */
	async loadMemory(options?: { maxTokens?: number }): Promise<string> {
		const path = `${this.intelligenceDir}/memory.md`;
		const content = await this._readFile(path);
		if (!content || !options?.maxTokens) return content;

		// Simple truncation: keep last N characters (roughly 4 chars per token)
		const maxChars = options.maxTokens * 4;
		if (content.length <= maxChars) return content;

		// Find a good break point — keep from the latest "## Entries" section
		const entriesIdx = content.lastIndexOf("## Entries");
		if (entriesIdx >= 0 && content.length - entriesIdx <= maxChars) {
			return content.slice(entriesIdx);
		}

		// Fallback: just trim from the top
		return "..." + content.slice(-maxChars + 3);
	}

	/**
	 * Combine persona + memory into a single context string.
	 * Respects the token budget by trimming memory if needed.
	 */
	async loadFullContext(options?: { maxTokens?: number }): Promise<string> {
		const maxTokens = options?.maxTokens ?? 2000;
		const persona = await this.loadPersona();
		const personaTokens = Math.ceil(persona.length / 4);
		const memoryBudget = Math.max(0, maxTokens - personaTokens - 50); // 50 for separator

		const memory = await this.loadMemory({ maxTokens: memoryBudget });

		const parts: string[] = [];
		if (persona.trim()) parts.push(persona.trim());
		if (memory.trim()) parts.push(`## Memory\n\n${memory.trim()}`);

		return parts.join("\n\n---\n\n");
	}

	/** Append a memory entry to memory.md. */
	async appendMemory(entry: string): Promise<void> {
		const path = `${this.intelligenceDir}/memory.md`;
		const adapter = this.deps.app.vault.adapter;
		const exists = await adapter.exists(path);
		if (!exists) {
			await adapter.write(path, DEFAULT_MEMORY + entry + "\n");
		} else {
			await adapter.write(path, await adapter.read(path) + entry + "\n");
		}
		this.deps.logger?.log("info", `Appended memory entry to ${path}`);
	}

	private async _readFile(path: string): Promise<string> {
		try {
			if (await this.deps.app.vault.adapter.exists(path)) {
				return await this.deps.app.vault.adapter.read(path);
			}
		} catch (e) {
			this.deps.logger?.log("warn", `Failed to read ${path}: ${e}`);
		}
		return "";
	}
}
