import { App } from "obsidian";
import { FileLogger } from "../logger";
import { MemoryStore } from "./MemoryStore";

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
 *   .obsidian/plugins/chat-lab/intelligence/
 */
export class PersonaLoader {
	private deps: PersonaLoaderDeps;
	private readonly intelligenceDir: string;
	readonly memoryStore: MemoryStore;

	constructor(deps: PersonaLoaderDeps) {
		this.deps = deps;
		this.intelligenceDir = `${deps.app.vault.configDir}/plugins/${deps.manifest.id}/intelligence`;
		this.memoryStore = new MemoryStore({
			app: deps.app,
			intelligenceDir: this.intelligenceDir,
			logger: deps.logger,
		});
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

		// Migrate legacy markdown memory if needed
		await this.memoryStore.migrateFromMarkdown();
		this.deps.logger?.log("info", `MemoryStore initialized at ${this.intelligenceDir}`);
	}

	/** Read persona.md — returns content or empty string if disabled/missing. */
	async loadPersona(): Promise<string> {
		const path = `${this.intelligenceDir}/persona.md`;
		return this._readFile(path);
	}

	/** Read memory entries as markdown (truncated if needed). */
	async loadMemory(options?: { maxTokens?: number }): Promise<string> {
		const entries = await this.memoryStore.list();
		if (entries.length === 0) return "";

		// Build markdown from entries
		const lines = entries.map(
			(e) =>
				`- [${e.timestamp}] **${e.category}**: ${e.content}${e.tags.length ? " " + e.tags.map((t) => `#${t}`).join(" ") : ""}`,
		);
		const md = lines.join("\n");

		if (!options?.maxTokens) return md;

		const maxChars = options.maxTokens * 4;
		if (md.length <= maxChars) return md;

		// Truncate from the top (keep newest)
		const truncated = md.slice(-maxChars + 3);
		const firstNewline = truncated.indexOf("\n");
		return "..." + (firstNewline > 0 ? truncated.slice(firstNewline + 1) : truncated);
	}

	/** Append a memory entry (delegates to MemoryStore). */
	async appendMemory(category: string, content: string, tags?: string[]): Promise<string> {
		const validCategories = ["user_fact", "project", "preference", "insight", "reference"] as const;
		if (!validCategories.includes(category as any)) {
			throw new Error(`Invalid memory category: ${category}`);
		}
		const entry = await this.memoryStore.create(
			category as any,
			content,
			tags,
		);
		return entry.id;
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
