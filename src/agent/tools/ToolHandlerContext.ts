import type { App } from "obsidian";
import type { ObsidianAISettings } from "../../settings";
import type { PersonaLoader } from "../../intelligence/PersonaLoader";
import type { SearchIndex } from "../../search/index";
import type { ProviderRegistry } from "../../integrations/ProviderRegistry";
import { ContinuationStore } from "../pagination";
import { ToolResolver } from "./ToolResolver";
import type { ChatMessage, ThinkingMode } from "../../types";
import type { ProviderType } from "../../settings";
import type { SessionStateOwner } from "../../state/SessionStateOwner";

/** Model/profile context resolved for the turn that invoked a tool. */
export interface CurrentTurnModelContext {
	profileId: string;
	provider: ProviderType;
	profileName: string;
	model: string;
	thinkingMode: ThinkingMode;
}

/** Latest effective system prompt captured immediately before a provider call. */
export interface LatestSystemPromptSnapshot {
	label: string;
	content: string;
	capturedAt: number;
}

export interface SessionToolServices {
	state?: SessionStateOwner | null;
	openSession?: (sessionId: string, messageId?: string) => Promise<void>;
	getActiveSessionId?: () => string | null;
	isSessionBusy?: (sessionId: string) => boolean;
}

/** Services shared by the capability-specific handlers. */
export interface ToolHandlerContext {
	app: App;
	pluginId?: string;
	resolver: ToolResolver;
	settings?: ObsidianAISettings;
	personaLoader?: PersonaLoader;
	searchIndex?: SearchIndex;
	getActiveSessionId?: () => string | null;
	getSessions?: () =>
		| ReadonlyArray<{ id: string; messages: ChatMessage[] }>
		| undefined;
	sessionTools?: SessionToolServices;
	integrationRegistry?: ProviderRegistry;
	saveSettings?: () => Promise<void>;
	currentTurnModelContext?: CurrentTurnModelContext;
	continuations: ContinuationStore;
}

/** Give each handler the same host services without repeating constructors. */
export abstract class ToolHandlerBase {
	protected readonly app: App;
	protected readonly pluginId?: string;
	protected readonly resolver: ToolResolver;
	protected readonly settings?: ObsidianAISettings;
	protected readonly personaLoader?: PersonaLoader;
	protected readonly searchIndex?: SearchIndex;
	protected readonly getActiveSessionId?: () => string | null;
	protected readonly getSessions?: () =>
		| ReadonlyArray<{ id: string; messages: ChatMessage[] }>
		| undefined;
	protected readonly sessionTools?: SessionToolServices;
	protected readonly integrationRegistry?: ProviderRegistry;
	protected readonly saveSettings?: () => Promise<void>;
	protected readonly currentTurnModelContext?: CurrentTurnModelContext;
	protected readonly continuations: ContinuationStore;

	protected constructor(context: ToolHandlerContext) {
		this.app = context.app;
		this.pluginId = context.pluginId;
		this.resolver = context.resolver;
		this.settings = context.settings;
		this.personaLoader = context.personaLoader;
		this.searchIndex = context.searchIndex;
		this.getActiveSessionId = context.getActiveSessionId;
		this.getSessions = context.getSessions;
		this.sessionTools = context.sessionTools;
		this.integrationRegistry = context.integrationRegistry;
		this.saveSettings = context.saveSettings;
		this.currentTurnModelContext = context.currentTurnModelContext;
		this.continuations = context.continuations;
	}
}
