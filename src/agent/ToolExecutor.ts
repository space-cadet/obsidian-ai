import { App } from "obsidian";
import type { ToolCall, ToolResult } from "./types";
import type { ObsidianAISettings } from "../settings";
import type { PersonaLoader } from "../intelligence/PersonaLoader";
import { SearchIndex } from "../search/index";
import type { ProviderRegistry } from "../integrations/ProviderRegistry";
import {
	createBuiltInToolDefinitionsWithExecutors,
	resolveToolRegistry,
	validateToolArguments,
} from "./toolRegistry";
import type { ResolvedToolRegistry, ToolDefinition } from "./toolRegistry";
import { ContinuationStore, requestFingerprint } from "./pagination";
import { ToolResolver } from "./tools/ToolResolver";
import { NoteHandlers } from "./tools/handlers/noteHandlers";
import { ToolHandlers } from "./tools/ToolHandlers";

export class ToolExecutor {
	private builtInRegistry: ResolvedToolRegistry;
	private readonly continuations = new ContinuationStore();
	private readonly resolver: ToolResolver;
	private readonly noteHandlers: NoteHandlers;
	private readonly handlers: ToolHandlers;

	constructor(
		app: App,
		private settings?: ObsidianAISettings,
		personaLoader?: PersonaLoader,
		searchIndex?: SearchIndex,
		getActiveSessionId?: () => string | null,
		private integrationRegistry?: ProviderRegistry,
		saveSettings?: () => Promise<void>,
	) {
		this.resolver = new ToolResolver(app);
		this.noteHandlers = new NoteHandlers(app, this.resolver);
		this.handlers = new ToolHandlers(
			app,
			this.resolver,
			settings,
			personaLoader,
			searchIndex,
			getActiveSessionId,
			integrationRegistry,
			saveSettings,
			this.continuations,
		);
		// Build the same descriptor registry used to expose tools to the model.
		// Built-in and provider execution both pass through this map.
		const builtInDefinitions = createBuiltInToolDefinitionsWithExecutors({
			read_note: (call) =>
				this.noteHandlers.readNote(call.args as { path: string }),
			edit_note: (call) =>
				this.noteHandlers.editNote(
					call.args as { path: string; content: string },
				),
			append_to_note: (call) =>
				this.noteHandlers.appendToNote(
					call.args as { path: string; content: string },
				),
			create_note: (call) =>
				this.noteHandlers.createNote(
					call.args as { path: string; content: string },
				),
			create_notes: (call) =>
				this.noteHandlers.createNotes(
					call.args as {
						notes: Array<{ path: string; content: string }>;
					},
				),
			patch_note: (call) =>
				this.noteHandlers.patchNote(
					call.args as {
						path: string;
						search: string;
						replace: string;
						replace_all?: boolean;
					},
				),
			edit_section: (call) =>
				this.noteHandlers.editSection(
					call.args as {
						path: string;
						section_heading: string;
						new_content: string;
					},
				),
			search_notes: (call) =>
				this.handlers.searchNotes(
					call.args as {
						query: string;
						sort_by?: string;
						limit?: number;
						folder?: string;
						cursor?: string;
					},
				),
			search_note_content: (call) =>
				this.handlers.searchNoteContent(
					call.args as {
						query: string;
						folder?: string;
						sort_by?: string;
						limit?: number;
						context_lines?: number;
						match_mode?: string;
						include_filename?: boolean;
						include_snippets?: boolean;
						cursor?: string;
					},
				),
			list_notes: (call) =>
				this.handlers.listNotes(
					call.args as {
						folder?: string;
						sort_by?: string;
						limit?: number;
						include_subfolders?: boolean;
						depth?: number;
						cursor?: string;
					},
				),
			count_notes: (call) =>
				this.handlers.countNotes(call.args as { folder?: string }),
			get_note_metadata: (call) =>
				this.handlers.getNoteMetadata(call.args as { path: string }),
			list_folders: (call) =>
				this.handlers.listFolders(call.args as { path?: string }),
			check_paths: (call) =>
				this.handlers.checkPaths(call.args as { paths: string[] }),
			search_web: (call) =>
				this.handlers.searchWeb(
					call.args as {
						query: string;
						limit?: number;
						cursor?: string;
					},
				),
			read_pdf: (call) =>
				this.handlers.readPdf(
					call.args as {
						source: string;
						max_pages?: number;
						start_page?: number;
					},
				),
			create_memory: (call) =>
				this.handlers.createMemory(
					call.args as {
						category: string;
						content: string;
						tags?: string[];
					},
				),
			update_memory: (call) =>
				this.handlers.updateMemory(
					call.args as {
						id: string;
						category?: string;
						content?: string;
						tags?: string[];
					},
				),
			delete_memory: (call) =>
				this.handlers.deleteMemory(call.args as { id: string }),
			list_memories: (call) =>
				this.handlers.listMemories(
					call.args as {
						category?: string;
						tag?: string;
						limit?: number;
						cursor?: string;
					},
				),
			search_memories: (call) =>
				this.handlers.searchMemories(
					call.args as {
						query: string;
						limit?: number;
						cursor?: string;
					},
				),
			read_memory_audit: (call) =>
				this.handlers.readMemoryAudit(
					call.args as { limit?: number; cursor?: string },
				),
			search_past_sessions: (call) =>
				this.handlers.searchPastSessions(
					call.args as {
						query: string;
						limit?: number;
						cursor?: string;
					},
				),
			create_folder: (call) =>
				this.handlers.createFolder(call.args as { path: string }),
			move_note: (call) =>
				this.handlers.moveNote(
					call.args as { path: string; new_path: string },
				),
			delete_note: (call) =>
				this.handlers.deleteNote(call.args as { path: string }),
			read_settings: (call) => this.handlers.readSettings(),
			update_setting: (call) =>
				this.handlers.updateSetting(
					call.args as { key: string; value: unknown },
				),
		});
		const providerDefinitions: ToolDefinition[] =
			this.integrationRegistry?.getToolDefinitions() ?? [];
		this.builtInRegistry = resolveToolRegistry(
			[...builtInDefinitions, ...providerDefinitions],
			{
				enableMemoryAuditTool:
					this.settings?.intelligence?.enableMemoryAuditTool,
				developerMode: this.settings?.developerMode,
			},
		);
	}

	getModelTools(): Record<string, Record<string, unknown>> {
		return this.builtInRegistry.tools;
	}

	/**
	 * Return the exact definitions used by this executor.
	 * Callers should use this result for both model exposure and execution.
	 */
	getResolvedToolRegistry(): ResolvedToolRegistry {
		return this.builtInRegistry;
	}

	async execute(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
		try {
			const registryDef = this.builtInRegistry.byId.get(call.toolName);
			if (!registryDef?.execute) {
				return {
					error: `Unknown or unavailable tool: ${call.toolName}`,
				};
			}
			if (signal?.aborted) {
				return { error: "Tool call cancelled before execution." };
			}

			const validation = await validateToolArguments(
				registryDef,
				call.args,
			);
			if (!validation.ok) {
				return {
					error: `Invalid arguments for ${call.toolName}: ${validation.error}`,
				};
			}

			const result = await registryDef.execute(
				{ ...call, args: validation.args },
				{
					enableMemoryAuditTool:
						this.settings?.intelligence?.enableMemoryAuditTool,
				},
			);
			return result;
		} catch (e: any) {
			return { error: e.message || String(e) };
		}
	}
}
