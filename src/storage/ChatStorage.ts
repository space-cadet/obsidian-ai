import type { App } from "obsidian";
import type {
	StoredChatData,
	ChatSession,
	ChatMessage,
	ContextItem,
} from "../types";
import type { ObsidianAISettings } from "../settings";

export interface StorageDeps {
	app: App;
	manifest: { id: string };
	settings: ObsidianAISettings;
	loadData(): Promise<any>;
	saveData(data: any): Promise<void>;
	logger?: { log(level: string, msg: string): void };
}

export interface ChatStorage {
	loadChatData(): Promise<StoredChatData>;
	saveChatData(data: StoredChatData): Promise<void>;
	detectLegacyFormat(): Promise<boolean>;
}

export function createStorage(
	deps: StorageDeps,
	format: "legacy" | "jsonl",
): ChatStorage {
	if (format === "jsonl") {
		return new JsonlStorage(deps);
	}
	return new LegacyStorage(deps);
}

// ─────────────────────────────────────────────────────────────
// Legacy Storage — everything in data.json (current behavior)
// ─────────────────────────────────────────────────────────────

class LegacyStorage implements ChatStorage {
	constructor(private deps: StorageDeps) {}

	async loadChatData(): Promise<StoredChatData> {
		this.deps.logger?.log(
			"info",
			"LegacyStorage: loadChatData reading data.json",
		);
		const data = await this.deps.loadData();

		if (data?.chatData && Array.isArray(data.chatData.sessions)) {
			const chatData = data.chatData as StoredChatData;
			for (const session of chatData.sessions) {
				if (!Array.isArray(session.contextItems)) {
					session.contextItems = [];
				}
			}
			return chatData;
		}

		if (Array.isArray(data?.chatMessages) && data.chatMessages.length > 0) {
			const migrated: StoredChatData = {
				sessions: [
					{
						id: crypto.randomUUID(),
						title: "Previous Chat",
						createdAt: Date.now(),
						updatedAt: Date.now(),
						messages: data.chatMessages,
						contextItems: [],
					},
				],
				activeSessionId: null,
			};
			return migrated;
		}

		return { sessions: [], activeSessionId: null };
	}

	async saveChatData(data: StoredChatData): Promise<void> {
		this.deps.logger?.log(
			"info",
			"LegacyStorage: saveChatData writing data.json",
		);
		const existing = (await this.deps.loadData()) ?? {};
		const payload = { ...existing, chatData: data };
		await this.deps.saveData(payload);
		this.deps.logger?.log(
			"info",
			"LegacyStorage: data.json written successfully",
		);
	}

	async detectLegacyFormat(): Promise<boolean> {
		const data = await this.deps.loadData();
		return data?.chatData != null || Array.isArray(data?.chatMessages);
	}
}

// ─────────────────────────────────────────────────────────────
// JSONL Storage — split architecture
// ─────────────────────────────────────────────────────────────

interface SessionIndexEntry {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	filePath: string;
	profileId?: string;
	isGroupChat?: boolean;
	participants?: {
		id: string;
		name: string;
		profileId: string;
		color: string;
		icon?: string;
	}[];
	selectedProfileIds?: string[];
	modelOverrides?: Record<string, string>;
	thinkingEnabled?: boolean;
	contextItems?: ContextItem[];
	scrollPosition?: number;
}

interface SessionIndex {
	version: number;
	sessions: SessionIndexEntry[];
	activeSessionId: string | null;
	openSessionIds?: string[];
}

const INDEX_VERSION = 1;
const SESSIONS_DIR = "sessions";

class JsonlStorage implements ChatStorage {
	private deps: StorageDeps;
	private lastSavedState: {
		sessions: Map<string, { messageIds: string[]; updatedAt: number }>;
		activeSessionId: string | null;
	} | null = null;

	constructor(deps: StorageDeps) {
		this.deps = deps;
	}

	async detectLegacyFormat(): Promise<boolean> {
		const data = await this.deps.loadData();
		return data?.chatData != null || Array.isArray(data?.chatMessages);
	}

	async loadChatData(): Promise<StoredChatData> {
		const adapter = this.deps.app.vault.adapter;
		const pluginDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}`;
		const indexPath = `${pluginDir}/${SESSIONS_DIR}/index.json`;

		if (!(await adapter.exists(indexPath))) {
			return { sessions: [], activeSessionId: null };
		}

		let index: SessionIndex;
		try {
			const raw = await adapter.read(indexPath);
			index = JSON.parse(raw) as SessionIndex;
		} catch {
			return { sessions: [], activeSessionId: null };
		}

		const sessions: ChatSession[] = await Promise.all(
			index.sessions.map(async (entry) => {
				const messages = await this._loadMessages(
					`${pluginDir}/${entry.filePath}`,
				);
				return {
					id: entry.id,
					title: entry.title,
					createdAt: entry.createdAt,
					updatedAt: entry.updatedAt,
					messages,
					contextItems: entry.contextItems ?? [],
					profileId: entry.profileId,
					isGroupChat: entry.isGroupChat,
					participants: entry.participants,
					selectedProfileIds: entry.selectedProfileIds,
					modelOverrides: entry.modelOverrides,
					thinkingEnabled: entry.thinkingEnabled,
					scrollPosition: entry.scrollPosition,
				};
			}),
		);

		this.lastSavedState = {
			sessions: new Map(
				sessions.map((s) => [
					s.id,
					{
						messageIds: s.messages.map((m) => m.id),
						updatedAt: s.updatedAt,
					},
				]),
			),
			activeSessionId: index.activeSessionId,
		};

		return {
			sessions,
			activeSessionId: index.activeSessionId,
			openSessionIds: index.openSessionIds,
		};
	}

	async saveChatData(data: StoredChatData): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		const pluginDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}`;
		const sessionsDir = `${pluginDir}/${SESSIONS_DIR}`;

		if (!(await adapter.exists(sessionsDir))) {
			await adapter.mkdir(sessionsDir);
		}

		const indexEntries: SessionIndexEntry[] = [];

		for (const session of data.sessions) {
			const filePath = `${SESSIONS_DIR}/${session.id}.jsonl`;
			const fullPath = `${pluginDir}/${filePath}`;

			const previous = this.lastSavedState?.sessions.get(session.id);
			const previousMessageIds = previous?.messageIds ?? null;

			await this._writeMessages(
				fullPath,
				session.messages,
				previousMessageIds,
			);

			indexEntries.push({
				id: session.id,
				title: session.title,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				messageCount: session.messages.length,
				filePath,
				profileId: session.profileId,
				isGroupChat: session.isGroupChat,
				participants: session.participants,
				selectedProfileIds: session.selectedProfileIds,
				modelOverrides: session.modelOverrides,
				thinkingEnabled: session.thinkingEnabled,
				scrollPosition: session.scrollPosition,
				contextItems: session.contextItems,
			});
		}

		const index: SessionIndex = {
			version: INDEX_VERSION,
			sessions: indexEntries,
			activeSessionId: data.activeSessionId,
			openSessionIds: data.openSessionIds,
		};

		await adapter.write(
			`${sessionsDir}/index.json`,
			JSON.stringify(index, null, 2),
		);

		this.lastSavedState = {
			sessions: new Map(
				data.sessions.map((s) => [
					s.id,
					{
						messageIds: s.messages.map((m) => m.id),
						updatedAt: s.updatedAt,
					},
				]),
			),
			activeSessionId: data.activeSessionId,
		};
	}

	private async _loadMessages(path: string): Promise<ChatMessage[]> {
		const adapter = this.deps.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			return [];
		}
		const raw = await adapter.read(path);
		if (!raw.trim()) return [];
		const lines = raw.split("\n").filter((l) => l.trim());
		const messages: ChatMessage[] = [];
		for (const line of lines) {
			try {
				const parsed = JSON.parse(line);
				// Basic schema validation
				if (
					parsed &&
					typeof parsed === "object" &&
					typeof parsed.id === "string" &&
					typeof parsed.role === "string" &&
					["user", "assistant", "system"].includes(parsed.role)
				) {
					messages.push(parsed as ChatMessage);
				} else {
					this.deps.logger?.log(
						"warn",
						`ChatStorage: skipping malformed message line in ${path}`,
					);
				}
			} catch {
				this.deps.logger?.log(
					"warn",
					`ChatStorage: failed to parse message line in ${path}`,
				);
			}
		}
		return messages;
	}

	private async _writeMessages(
		path: string,
		messages: ChatMessage[],
		previousMessageIds: string[] | null,
	): Promise<void> {
		const adapter = this.deps.app.vault.adapter;

		const canAppend =
			previousMessageIds !== null &&
			messages.length >= previousMessageIds.length &&
			messages
				.slice(0, previousMessageIds.length)
				.every((m, i) => m.id === previousMessageIds[i]);

		if (canAppend) {
			const newMessages = messages.slice(previousMessageIds.length);
			if (newMessages.length > 0) {
				const lines =
					newMessages.map((m) => JSON.stringify(m)).join("\n") + "\n";
				await adapter.append(path, lines);
			}
		} else {
			const content = messages.map((m) => JSON.stringify(m)).join("\n");
			await adapter.write(path, content ? content + "\n" : "");
		}
	}
}
