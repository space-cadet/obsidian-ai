import type { App } from "obsidian";
import type { ObsidianAISettings } from "../../settings";
import type { PersonaLoader } from "../../intelligence/PersonaLoader";
import type { SearchIndex } from "../../search/index";
import type { ProviderRegistry } from "../../integrations/ProviderRegistry";
import { ContinuationStore } from "../pagination";
import { ToolResolver } from "./ToolResolver";

/** Services shared by the capability-specific handlers. */
export interface ToolHandlerContext {
	app: App;
	resolver: ToolResolver;
	settings?: ObsidianAISettings;
	personaLoader?: PersonaLoader;
	searchIndex?: SearchIndex;
	getActiveSessionId?: () => string | null;
	integrationRegistry?: ProviderRegistry;
	saveSettings?: () => Promise<void>;
	continuations: ContinuationStore;
}

/** Give each handler the same host services without repeating constructors. */
export abstract class ToolHandlerBase {
	protected readonly app: App;
	protected readonly resolver: ToolResolver;
	protected readonly settings?: ObsidianAISettings;
	protected readonly personaLoader?: PersonaLoader;
	protected readonly searchIndex?: SearchIndex;
	protected readonly getActiveSessionId?: () => string | null;
	protected readonly integrationRegistry?: ProviderRegistry;
	protected readonly saveSettings?: () => Promise<void>;
	protected readonly continuations: ContinuationStore;

	protected constructor(context: ToolHandlerContext) {
		this.app = context.app;
		this.resolver = context.resolver;
		this.settings = context.settings;
		this.personaLoader = context.personaLoader;
		this.searchIndex = context.searchIndex;
		this.getActiveSessionId = context.getActiveSessionId;
		this.integrationRegistry = context.integrationRegistry;
		this.saveSettings = context.saveSettings;
		this.continuations = context.continuations;
	}
}
