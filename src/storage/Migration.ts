import type { StorageDeps } from "./ChatStorage";
import type { StoredChatData, ChatSession } from "../types";

export interface MigrationResult {
	success: boolean;
	sessionCount: number;
	messageCount: number;
	error?: string;
}

function normalizeMessagesForMigration(
	sessionId: string,
	messages: ChatSession["messages"],
): ChatSession["messages"] {
	const seen = new Map<string, string>();
	const normalized: ChatSession["messages"] = [];
	for (const message of messages) {
		const serialized = JSON.stringify(message);
		const previous = seen.get(message.id);
		if (previous === serialized) continue;
		if (previous !== undefined) {
			throw new Error(
				`Cannot migrate session ${sessionId}: conflicting records share message ID ${message.id}`,
			);
		}
		seen.set(message.id, serialized);
		normalized.push(message);
	}
	return normalized;
}

export class ChatStorageMigration {
	constructor(private deps: StorageDeps) {}

	async migrate(): Promise<MigrationResult> {
		this.deps.logger?.log(
			"info",
			"Migration: starting legacy → JSONL migration",
		);

		try {
			// 1. Load legacy data
			const data = await this.deps.loadData();
			let chatData: StoredChatData;

			if (data?.chatData && Array.isArray(data.chatData.sessions)) {
				chatData = data.chatData as StoredChatData;
			} else if (
				Array.isArray(data?.chatMessages) &&
				data.chatMessages.length > 0
			) {
				chatData = {
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
			} else {
				chatData = { sessions: [], activeSessionId: null };
			}

			// 2. Ensure all sessions have IDs
			for (const session of chatData.sessions) {
				if (!session.id) session.id = crypto.randomUUID();
			}
			const messagesBySession = new Map(
				chatData.sessions.map((session) => [
					session.id,
					normalizeMessagesForMigration(session.id, session.messages),
				]),
			);

			// 3. Write JSONL files
			const adapter = this.deps.app.vault.adapter;
			const pluginDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}`;
			const sessionsDir = `${pluginDir}/sessions`;

			if (!(await adapter.exists(sessionsDir))) {
				await adapter.mkdir(sessionsDir);
			}

			let totalMessages = 0;
			const indexEntries = await Promise.all(
				chatData.sessions.map(async (session) => {
					const messages = messagesBySession.get(session.id) ?? [];
					const filePath = `sessions/${session.id}.jsonl`;
					const fullPath = `${pluginDir}/${filePath}`;
					const content = messages
						.map((m) => JSON.stringify(m))
						.join("\n");

					// A zero-message session can remain in the index for draft state,
					// but it does not need an empty transcript file.
					if (content) await adapter.write(fullPath, content + "\n");
					totalMessages += messages.length;
					const draftAttachmentsFile = session.draftAttachments
						?.length
						? `sessions/${session.id}.draft.json`
						: undefined;
					if (draftAttachmentsFile) {
						await adapter.write(
							`${pluginDir}/${draftAttachmentsFile}`,
							JSON.stringify(session.draftAttachments),
						);
					}

					return {
						id: session.id,
						title: session.title,
						createdAt: session.createdAt,
						updatedAt: session.updatedAt,
						messageCount: messages.length,
						filePath,
						profileId: session.profileId,
						isGroupChat: session.isGroupChat,
						participants: session.participants,
						selectedProfileIds: session.selectedProfileIds,
						thinkingEnabled: session.thinkingEnabled,
						thinkingMode: session.thinkingMode,
						draft: session.draft,
						draftAttachmentsFile,
						contextItems: session.contextItems,
						tags: session.tags,
						autoTagPending: session.autoTagPending,
					};
				}),
			);

			// 4. Write index.json
			const index = {
				version: 1,
				sessions: indexEntries,
				activeSessionId: chatData.activeSessionId,
			};
			await adapter.write(
				`${sessionsDir}/index.json`,
				JSON.stringify(index, null, 2),
			);

			// 5. Strip chatData from data.json, keep only settings
			const { chatData: _, chatMessages: __, ...settingsOnly } = data;
			await this.deps.saveData(settingsOnly);

			this.deps.logger?.log(
				"info",
				`Migration: complete — ${chatData.sessions.length} sessions, ${totalMessages} messages migrated`,
			);

			return {
				success: true,
				sessionCount: chatData.sessions.length,
				messageCount: totalMessages,
			};
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			this.deps.logger?.log("error", `Migration failed: ${error}`);
			return { success: false, sessionCount: 0, messageCount: 0, error };
		}
	}

	async canMigrate(): Promise<boolean> {
		const data = await this.deps.loadData();
		return data?.chatData != null || Array.isArray(data?.chatMessages);
	}
}
