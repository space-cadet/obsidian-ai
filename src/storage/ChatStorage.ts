import type { App } from "obsidian";
import type {
	StoredChatData,
	ChatSession,
	ChatMessage,
	ContextItem,
	CompactionMetadata,
	Attachment,
	SessionHydrationResult,
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

export interface LoadChatDataOptions {
	/** Read every session's message file up front. Default false: boot from
		the index only and hydrate message files on first open. Used by sync,
		diagnostics, and usage stats — anything that needs full transcripts. */
	hydrate?: boolean;
}

export interface ChatStorage {
	loadChatData(opts?: LoadChatDataOptions): Promise<StoredChatData>;
	saveChatData(data: StoredChatData): Promise<void>;
	detectLegacyFormat(): Promise<boolean>;
	/** Read one session's message file into memory. Returns the messages. */
	hydrateSession?(sessionId: string): Promise<ChatMessage[]>;
	hydrateSessionWithMetadata?(
		sessionId: string,
	): Promise<SessionHydrationResult>;
	peekSessionMessages?(sessionId: string): Promise<ChatMessage[]>;
	/** False while a session's messages exist on disk but haven't been read. */
	isSessionHydrated?(sessionId: string): boolean;
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

	async loadChatData(_opts?: LoadChatDataOptions): Promise<StoredChatData> {
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
	thinkingMode?: ChatSession["thinkingMode"];
	draft?: string;
	draftAttachmentsFile?: string;
	contextItems?: ContextItem[];
	scrollPosition?: number;
	compactionMetadata?: CompactionMetadata;
}

interface SessionIndex {
	version: number;
	sessions: SessionIndexEntry[];
	activeSessionId: string | null;
	openSessionIds?: string[];
}

interface LoadedSessionMessages {
	messages: ChatMessage[];
	exactDuplicateCount: number;
	invalidRecordCount: number;
}

const INDEX_VERSION = 1;
const SESSIONS_DIR = "sessions";
// Obsidian's mobile filesystem bridge materializes the complete file as a
// native JSON value before returning it to JavaScript. Keep individual
// transcript reads bounded so an unexpectedly duplicated JSONL file cannot
// take down the whole app.
const MAX_SESSION_READ_BYTES = 16 * 1024 * 1024;
const PENDING_SAVE_FILE = ".chat-lab-pending-save.json";
const PENDING_SAVE_PREFIX = ".chat-lab-pending-save-";

interface PendingSessionWrite {
	target: string;
	staged: string;
	mode: "replace" | "append";
	prefixChars?: number;
	prefixBytes?: number;
	prefixHash?: string;
	finalHash?: string;
}

interface PendingSessionTransaction {
	version: 1;
	stageDir: string;
	writes: PendingSessionWrite[];
	deletes: string[];
}

interface PlannedSessionWrite {
	target: string;
	content: string;
	appendPrefixCount?: number;
}

function hashText(value: string): string {
	let first = 2166136261;
	let second = 5381;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		first ^= code;
		first = Math.imul(first, 16777619);
		second = Math.imul(second, 33) ^ code;
	}
	return `${value.length}:${(first >>> 0).toString(16).padStart(8, "0")}:${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function isSessionRelativePath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.startsWith(`${SESSIONS_DIR}/`) &&
		!value.split("/").some((part) => part === ".." || part === "")
	);
}

function normalizeSessionMessages(
	sessionId: string,
	messages: ChatMessage[],
): ChatMessage[] {
	const byId = new Map<string, string>();
	const normalized: ChatMessage[] = [];
	for (const message of messages) {
		const serialized = JSON.stringify(message);
		const previous = byId.get(message.id);
		if (previous === serialized) continue;
		if (previous !== undefined) {
			throw new Error(
				`Cannot save session ${sessionId}: conflicting records share message ID ${message.id}`,
			);
		}
		byId.set(message.id, serialized);
		normalized.push(message);
	}
	return normalized;
}

class SessionTooLargeError extends Error {
	constructor(path: string, size: number) {
		super(
			`Session transcript is too large to load safely (${size} bytes): ${path}`,
		);
		this.name = "SessionTooLargeError";
	}
}

class JsonlStorage implements ChatStorage {
	private deps: StorageDeps;
	private lastSavedState: {
		sessions: Map<
			string,
			{ messageIds: string[] | null; updatedAt: number }
		>;
		activeSessionId: string | null;
	} | null = null;
	/** Sessions booted from the index whose message files have NOT been read
		yet, keyed by id with their original index entries. saveChatData must
		never write these (messages in memory are []) — only hydrateSession()
		(or a save carrying real messages, e.g. a sync download) clears them. */
	private unhydratedSessions = new Map<string, SessionIndexEntry>();
	/** Avoid rewriting potentially large inline file data on each text autosave. */
	private savedDraftAttachmentRefs = new Map<string, Attachment[]>();
	private activeSessionWriteStages = new Set<string>();
	private transcriptFingerprints = new Map<string, string>();
	/** In-flight hydrateSession calls — concurrent callers share one read. */
	private pendingHydrations = new Map<
		string,
		Promise<SessionHydrationResult>
	>();
	private sessionIoTail: Promise<void> = Promise.resolve();
	/** Sessions known to have their messages in UI memory (hydrated via
		hydrateSession() or saved carrying real messages). Metadata-only index
		reads use this to avoid re-flagging those sessions as unhydrated —
		doing so would make isSessionHydrated() lie and a later "hydration"
		could revert newer in-memory messages to disk state (Codex wave-3 P1). */
	private hydratedSessionIds = new Set<string>();
	/** Last authoritative index entries. Used to preserve message files and
		metadata when a UI snapshot is partial or metadata-only. */
	private indexEntriesById = new Map<string, SessionIndexEntry>();

	constructor(deps: StorageDeps) {
		this.deps = deps;
	}

	private async _withSessionIoLock<T>(
		operation: () => Promise<T>,
	): Promise<T> {
		const previous = this.sessionIoTail;
		let release!: () => void;
		this.sessionIoTail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await operation();
		} finally {
			release();
		}
	}

	async detectLegacyFormat(): Promise<boolean> {
		const data = await this.deps.loadData();
		return data?.chatData != null || Array.isArray(data?.chatMessages);
	}

	async loadChatData(
		opts: LoadChatDataOptions = {},
	): Promise<StoredChatData> {
		return this._withSessionIoLock(() => this._loadChatData(opts));
	}

	private async _loadChatData(
		opts: LoadChatDataOptions,
	): Promise<StoredChatData> {
		const adapter = this.deps.app.vault.adapter;
		const pluginDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}`;
		const sessionsDir = `${pluginDir}/${SESSIONS_DIR}`;
		await this._recoverPendingSessionWrite(pluginDir);
		const indexPath = `${sessionsDir}/index.json`;

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
		this.indexEntriesById = new Map(
			index.sessions.map((entry) => [entry.id, entry]),
		);

		const hydrateAll = opts.hydrate === true;
		// A full read (diagnostics, usage stats, sync cache) must never disturb
		// lazy-hydration write protection; only index-only boots rebuild it.
		if (!hydrateAll) this.unhydratedSessions.clear();

		const sessions: ChatSession[] = await Promise.all(
			index.sessions.map(async (entry) => {
				let messages: ChatMessage[] = [];
				// Bulk hydrate must not claim success for a session whose
				// message file is missing or unparseable — consumers (sync
				// cache, diagnostics) treat hydrated as "content verified".
				// Mirror the lazy hydrateSession() honesty guard.
				let hydrateFailed = false;
				if (hydrateAll) {
					const loaded = await this._loadMessagesWithDetails(
						`${pluginDir}/${entry.filePath}`,
					);
					messages = loaded.messages;
					const deduplicationExplainsMismatch =
						this.countMismatchExplainedByExactDeduplication(
							messages,
							entry.messageCount,
							loaded.exactDuplicateCount,
							loaded.invalidRecordCount,
						);
					if (
						(messages.length === 0 && entry.messageCount > 0) ||
						(messages.length < entry.messageCount &&
							!deduplicationExplainsMismatch)
					) {
						hydrateFailed = true;
						// Keep it retryable via hydrateSession() and under the
						// save-guard so an autosave can't clobber the index.
						this.unhydratedSessions.set(entry.id, entry);
						this.deps.logger?.log(
							"error",
							`JsonlStorage: bulk hydrate read ${messages.length}/${entry.messageCount} verified messages for ${entry.id} — leaving unhydrated for retry`,
						);
					} else {
						this.hydratedSessionIds.add(entry.id);
					}
					if (
						!hydrateFailed &&
						messages.length < entry.messageCount
					) {
						this.deps.logger?.log(
							"warn",
							`JsonlStorage: bulk hydrate read ${messages.length}/${entry.messageCount} messages for ${entry.id}`,
						);
					}
				} else {
					// Index-only boot: metadata now, messages on first open.
					// Sessions already known-hydrated (mid-session sync re-read)
					// stay OUT of the guard — the UI already holds their messages.
					if (!this.hydratedSessionIds.has(entry.id)) {
						this.unhydratedSessions.set(entry.id, entry);
					}
				}
				let draftAttachments: ChatSession["draftAttachments"];
				if (entry.draftAttachmentsFile) {
					try {
						const draftPath = `${pluginDir}/${entry.draftAttachmentsFile}`;
						if (await adapter.exists(draftPath)) {
							const parsed = JSON.parse(
								await adapter.read(draftPath),
							);
							if (Array.isArray(parsed)) {
								draftAttachments = parsed as Attachment[];
								this.savedDraftAttachmentRefs.set(
									entry.id,
									draftAttachments,
								);
							}
						}
					} catch (error) {
						this.deps.logger?.log(
							"warn",
							`JsonlStorage: could not read attachment draft for ${entry.id}: ${String(error)}`,
						);
					}
				}
				return {
					id: entry.id,
					title: entry.title,
					createdAt: entry.createdAt,
					updatedAt: entry.updatedAt,
					messages,
					messageCount: hydrateAll
						? hydrateFailed
							? entry.messageCount
							: messages.length
						: entry.messageCount,
					hydrated: hydrateAll && !hydrateFailed,
					contextItems: entry.contextItems ?? [],
					profileId: entry.profileId,
					isGroupChat: entry.isGroupChat,
					participants: entry.participants,
					selectedProfileIds: entry.selectedProfileIds,
					modelOverrides: entry.modelOverrides,
					thinkingEnabled: entry.thinkingEnabled,
					thinkingMode: entry.thinkingMode,
					draft: entry.draft,
					draftAttachments,
					scrollPosition: entry.scrollPosition,
					compactionMetadata: entry.compactionMetadata,
				};
			}),
		);

		const totalBytes = sessions.reduce(
			(sum, s) =>
				sum +
				s.messages.reduce(
					(m, msg) => m + (msg.content?.length ?? 0),
					0,
				),
			0,
		);
		this.deps.logger?.log(
			"info",
			`JsonlStorage: loaded ${sessions.length} session file(s), ` +
				`${sessions.reduce((n, s) => n + s.messages.length, 0)} message(s), ` +
				`~${Math.round(totalBytes / 1024)}KB of message text` +
				(hydrateAll ? "" : " (index-only boot)"),
		);

		this.lastSavedState = {
			sessions: new Map(
				sessions.map((s) => [
					s.id,
					{
						// null = on-disk ids unknown (index-only boot); forces a full
						// overwrite on the first write instead of a bad append.
						messageIds: hydrateAll
							? this.unhydratedSessions.has(s.id)
								? (this.lastSavedState?.sessions.get(s.id)
										?.messageIds ?? null)
								: s.messages.map((m) => m.id)
							: null,
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

	/** Read one session's message file into memory. Idempotent; returns [] for
		already-hydrated or unknown ids so callers can fire it unconditionally. */
	async hydrateSession(sessionId: string): Promise<ChatMessage[]> {
		return (await this.hydrateSessionWithMetadata(sessionId)).messages;
	}

	async hydrateSessionWithMetadata(
		sessionId: string,
	): Promise<SessionHydrationResult> {
		const pending = this.pendingHydrations.get(sessionId);
		if (pending) return pending;
		const p = this._withSessionIoLock(() =>
			this._hydrateSessionImpl(sessionId),
		).finally(() => this.pendingHydrations.delete(sessionId));
		this.pendingHydrations.set(sessionId, p);
		return p;
	}

	private async _hydrateSessionImpl(
		sessionId: string,
	): Promise<SessionHydrationResult> {
		const entry = this.unhydratedSessions.get(sessionId);
		if (!entry) {
			this.deps.logger?.log(
				"debug",
				`ChatStorage: hydrate skipped for ${sessionId} (no pending index entry)`,
			);
			return {
				messages: [],
				indexedMessageCount: 0,
				exactDuplicateCount: 0,
				invalidRecordCount: 0,
				countMismatchExplainedByExactDeduplication: false,
			};
		}
		const adapter = this.deps.app.vault.adapter;
		const pluginDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}`;
		const path = `${pluginDir}/${entry.filePath}`;
		this.deps.logger?.log(
			"debug",
			`ChatStorage: hydrate started for ${sessionId} (${entry.filePath}, expected ${entry.messageCount})`,
		);
		let loaded: LoadedSessionMessages;
		try {
			loaded = await this._loadMessagesWithDetails(path);
		} catch (err) {
			// Read failure (e.g. mobile bridge): leave the session unhydrated so
			// the next open retries, and surface it in the log instead of
			// silently returning [] and never trying again.
			this.deps.logger?.log(
				"error",
				`ChatStorage: hydrate read failed for ${sessionId} (${path}): ${String(err)}`,
			);
			// Do not let the view's empty-result fallback call peekSessionMessages
			// and repeat an oversized native bridge read.
			if (err instanceof SessionTooLargeError) throw err;
			return {
				messages: [],
				indexedMessageCount: entry.messageCount,
				exactDuplicateCount: 0,
				invalidRecordCount: 0,
				countMismatchExplainedByExactDeduplication: false,
			};
		}
		const { messages } = loaded;
		const deduplicationExplainsMismatch =
			this.countMismatchExplainedByExactDeduplication(
				messages,
				entry.messageCount,
				loaded.exactDuplicateCount,
				loaded.invalidRecordCount,
			);
		if (
			messages.length < entry.messageCount &&
			!deduplicationExplainsMismatch
		) {
			// Missing, malformed, or truncated content cannot be treated as a
			// complete transcript. Leave it retryable and keep the index count.
			this.deps.logger?.log(
				"error",
				`ChatStorage: hydrate read ${messages.length}/${entry.messageCount} verified messages for ${sessionId} (${path}) — leaving unhydrated for retry`,
			);
			return {
				messages: [],
				indexedMessageCount: entry.messageCount,
				exactDuplicateCount: loaded.exactDuplicateCount,
				invalidRecordCount: loaded.invalidRecordCount,
				countMismatchExplainedByExactDeduplication: false,
			};
		}
		if (messages.length < entry.messageCount) {
			this.deps.logger?.log(
				"warn",
				`ChatStorage: hydrate read ${messages.length}/${entry.messageCount} messages for ${sessionId} (${path})`,
			);
		}
		this.unhydratedSessions.delete(sessionId);
		this.hydratedSessionIds.add(sessionId);
		// Record the true on-disk ids so the next save can append correctly.
		this.lastSavedState?.sessions.set(sessionId, {
			messageIds: messages.map((m) => m.id),
			updatedAt: entry.updatedAt,
		});
		this.deps.logger?.log(
			"info",
			`ChatStorage: hydrated ${sessionId} (${messages.length}/${entry.messageCount} messages, ${entry.filePath})`,
		);
		return {
			messages,
			indexedMessageCount: entry.messageCount,
			exactDuplicateCount: loaded.exactDuplicateCount,
			invalidRecordCount: loaded.invalidRecordCount,
			countMismatchExplainedByExactDeduplication:
				this.countMismatchExplainedByExactDeduplication(
					messages,
					entry.messageCount,
					loaded.exactDuplicateCount,
					loaded.invalidRecordCount,
				),
		};
	}

	private countMismatchExplainedByExactDeduplication(
		messages: ChatMessage[],
		indexedMessageCount: number,
		exactDuplicateCount: number,
		invalidRecordCount: number,
	): boolean {
		return (
			messages.length < indexedMessageCount &&
			exactDuplicateCount > 0 &&
			invalidRecordCount === 0 &&
			messages.length + exactDuplicateCount === indexedMessageCount
		);
	}

	isSessionHydrated(sessionId: string): boolean {
		return !this.unhydratedSessions.has(sessionId);
	}

	/** Pure read of one session's messages for consumers that must not
		disturb lazy-hydration state (history copy/export, search): touches
		neither the unhydratedSessions guard nor lastSavedState. */
	async peekSessionMessages(sessionId: string): Promise<ChatMessage[]> {
		return this._withSessionIoLock(() =>
			this._peekSessionMessages(sessionId),
		);
	}

	private async _peekSessionMessages(
		sessionId: string,
	): Promise<ChatMessage[]> {
		const entry = this.unhydratedSessions.get(sessionId);
		const adapter = this.deps.app.vault.adapter;
		const pluginDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}`;
		const filePath =
			entry?.filePath ?? `${SESSIONS_DIR}/${sessionId}.jsonl`;
		const messages = await this._loadMessages(`${pluginDir}/${filePath}`);
		this.deps.logger?.log(
			messages.length > 0 ? "debug" : "warn",
			`ChatStorage: peek ${sessionId} read ${messages.length} message(s) from ${filePath}`,
		);
		return messages;
	}

	async saveChatData(data: StoredChatData): Promise<void> {
		return this._withSessionIoLock(() => this._saveChatData(data));
	}

	private async _saveChatData(data: StoredChatData): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		const pluginDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}`;
		const sessionsDir = `${pluginDir}/${SESSIONS_DIR}`;
		await this._recoverPendingSessionWrite(pluginDir);

		if (!(await adapter.exists(sessionsDir))) {
			await adapter.mkdir(sessionsDir);
		}

		// Validate every in-memory transcript before touching any files. Exact
		// replayed records are safe to collapse; conflicting payloads for one ID
		// must be surfaced rather than silently persisted or discarded.
		const deletedIds = new Set(data.deletedSessionIds ?? []);
		// A sync refresh can reintroduce a session after local deletion but before
		// autosave. Explicit tombstones take precedence over that stale snapshot.
		const incomingSessions = data.sessions.filter(
			(session) => !deletedIds.has(session.id),
		);
		const messagesBySession = new Map<string, ChatMessage[]>();
		for (const session of incomingSessions) {
			try {
				messagesBySession.set(
					session.id,
					normalizeSessionMessages(session.id, session.messages),
				);
			} catch (error) {
				this.deps.logger?.log(
					"error",
					`ChatStorage: blocked save with conflicting message IDs in ${session.id}: ${String(error)}`,
				);
				throw error;
			}
		}

		const indexEntries: SessionIndexEntry[] = [];
		const incomingIds = new Set(
			incomingSessions.map((session) => session.id),
		);
		let preservedUnhydratedSessions = 0;
		let preservedUnhydratedMessages = 0;
		const savedMessageIds = new Map<string, string[]>();
		const pendingWrites: PlannedSessionWrite[] = [];
		const pendingDeletes = new Set<string>();
		const draftRefsToSave = new Map<string, Attachment[]>();
		const draftRefsToDelete = new Set<string>();

		for (const session of incomingSessions) {
			const filePath = `${SESSIONS_DIR}/${session.id}.jsonl`;
			const draftAttachmentsFile = session.draftAttachments?.length
				? `${SESSIONS_DIR}/${session.id}.draft.json`
				: undefined;
			const oldDraftFile = this.indexEntriesById.get(
				session.id,
			)?.draftAttachmentsFile;
			if (draftAttachmentsFile) {
				if (
					this.savedDraftAttachmentRefs.get(session.id) !==
					session.draftAttachments
				) {
					pendingWrites.push({
						target: draftAttachmentsFile,
						content: JSON.stringify(session.draftAttachments),
					});
					draftRefsToSave.set(session.id, session.draftAttachments!);
				}
			} else {
				if (oldDraftFile) pendingDeletes.add(oldDraftFile);
				draftRefsToDelete.add(session.id);
			}

			const originalEntry =
				this.unhydratedSessions.get(session.id) ??
				this.indexEntriesById.get(session.id);
			const expectedMessageCount =
				session.messageCount ?? originalEntry?.messageCount ?? 0;
			if (session.messages.length === 0 && expectedMessageCount > 0) {
				// Hard guard: this session's messages were never read into memory
				// or a metadata-only refresh replaced a previously hydrated copy.
				// Writing [] would destroy the on-disk file. Preserve the index
				// entry regardless of the transient hydration bookkeeping state.
				const preservedEntry: SessionIndexEntry = originalEntry ?? {
					id: session.id,
					title: session.title,
					createdAt: session.createdAt,
					updatedAt: session.updatedAt,
					messageCount: expectedMessageCount,
					filePath,
				};
				indexEntries.push({
					...preservedEntry,
					title: session.title,
					draft: session.draft,
					draftAttachmentsFile,
					scrollPosition: session.scrollPosition,
				});
				preservedUnhydratedSessions++;
				preservedUnhydratedMessages += expectedMessageCount;
				continue;
			}
			if (
				session.messages.length === 0 &&
				expectedMessageCount === 0 &&
				(originalEntry?.messageCount ?? 0) > 0 &&
				(session.hydrated === true ||
					this.hydratedSessionIds.has(session.id))
			) {
				// This was a verified transcript that the caller intentionally
				// cleared. Remove its old JSONL file along with the zero-count index.
				pendingDeletes.add(filePath);
			}

			const previous = this.lastSavedState?.sessions.get(session.id);
			const previousMessageIds = previous?.messageIds ?? null;
			const messages = messagesBySession.get(session.id) ?? [];
			if (messages.length < session.messages.length) {
				this.deps.logger?.log(
					"warn",
					`ChatStorage: removed ${session.messages.length - messages.length} exact duplicate message record(s) before saving ${session.id}`,
				);
			}

			if (messages.length > 0) {
				pendingWrites.push({
					target: filePath,
					content: `${messages.map((m) => JSON.stringify(m)).join("\n")}\n`,
					appendPrefixCount:
						previousMessageIds !== null &&
						messages.length >= previousMessageIds.length &&
						messages
							.slice(0, previousMessageIds.length)
							.every(
								(message, index) =>
									message.id === previousMessageIds[index],
							)
							? previousMessageIds.length
							: undefined,
				});
			}
			savedMessageIds.set(
				session.id,
				messages.map((message) => message.id),
			);
			indexEntries.push({
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
				modelOverrides: session.modelOverrides,
				thinkingEnabled: session.thinkingEnabled,
				thinkingMode: session.thinkingMode,
				draft: session.draft,
				draftAttachmentsFile,
				scrollPosition: session.scrollPosition,
				contextItems: session.contextItems,
				compactionMetadata: session.compactionMetadata,
			});
		}
		if (preservedUnhydratedSessions > 0) {
			this.deps.logger?.log(
				"debug",
				`JsonlStorage: preserved ${preservedUnhydratedSessions} unhydrated session(s) with ${preservedUnhydratedMessages} on-disk message(s); skipped empty writes`,
			);
		}

		// A mounted chat view can hold a stale or intentionally bounded subset of
		// sessions. Absence from that snapshot is not deletion. Carry forward all
		// existing index entries unless the caller explicitly marks the ID deleted.
		for (const [id, entry] of this.indexEntriesById) {
			if (deletedIds.has(id)) {
				pendingDeletes.add(entry.filePath);
				if (entry.draftAttachmentsFile) {
					pendingDeletes.add(entry.draftAttachmentsFile);
				}
				draftRefsToDelete.add(id);
				continue;
			}
			if (!incomingIds.has(id) && !deletedIds.has(id)) {
				// Draft-only sessions are included in the input while they contain
				// composer data. Drop their index entry and attachment payload after
				// the draft is cleared; empty message sessions are not history.
				if (entry.messageCount === 0) {
					if (entry.draftAttachmentsFile) {
						pendingDeletes.add(entry.draftAttachmentsFile);
					}
					draftRefsToDelete.add(id);
					continue;
				}
				indexEntries.push(entry);
				this.deps.logger?.log(
					"warn",
					`JsonlStorage: preserved omitted session ${id} from partial snapshot`,
				);
			}
		}

		const index: SessionIndex = {
			version: INDEX_VERSION,
			sessions: indexEntries,
			activeSessionId:
				data.activeSessionId && !deletedIds.has(data.activeSessionId)
					? data.activeSessionId
					: null,
			openSessionIds: data.openSessionIds?.filter(
				(sessionId) => !deletedIds.has(sessionId),
			),
		};

		pendingWrites.push({
			target: `${SESSIONS_DIR}/index.json`,
			content: JSON.stringify(index, null, 2),
		});
		await this._commitSessionWriteTransaction(pluginDir, pendingWrites, [
			...pendingDeletes,
		]);
		for (const [sessionId, refs] of draftRefsToSave) {
			this.savedDraftAttachmentRefs.set(sessionId, refs);
		}
		for (const sessionId of draftRefsToDelete) {
			this.savedDraftAttachmentRefs.delete(sessionId);
		}
		for (const session of incomingSessions) {
			if (savedMessageIds.has(session.id)) {
				this.unhydratedSessions.delete(session.id);
				this.hydratedSessionIds.add(session.id);
			}
		}
		this.indexEntriesById = new Map(
			indexEntries.map((entry) => [entry.id, entry]),
		);

		this.lastSavedState = {
			sessions: new Map(
				incomingSessions.map((s) => [
					s.id,
					{
						messageIds: this.unhydratedSessions.has(s.id)
							? null
							: (savedMessageIds.get(s.id) ??
								s.messages.map((m) => m.id)),
						updatedAt: s.updatedAt,
					},
				]),
			),
			activeSessionId: index.activeSessionId,
		};
	}

	private async _commitSessionWriteTransaction(
		pluginDir: string,
		plannedWrites: PlannedSessionWrite[],
		deletes: string[],
	): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		const sessionsDir = `${pluginDir}/${SESSIONS_DIR}`;
		if (
			plannedWrites.some(
				(write) => !isSessionRelativePath(write.target),
			) ||
			deletes.some((path) => !isSessionRelativePath(path))
		) {
			throw new Error(
				"Cannot save session index: transaction contains an unsafe path",
			);
		}
		const transactionId = crypto.randomUUID();
		if (deletes.length > 0 && typeof adapter.remove !== "function") {
			throw new Error(
				"Cannot save session index: vault adapter does not support file removal",
			);
		}
		const stageDir = `${SESSIONS_DIR}/${PENDING_SAVE_PREFIX}${transactionId}`;
		const fullStageDir = `${pluginDir}/${stageDir}`;
		await adapter.mkdir(fullStageDir);
		this.activeSessionWriteStages.add(fullStageDir);
		try {
			const transaction: PendingSessionTransaction = {
				version: 1,
				stageDir,
				writes: [],
				deletes: [...new Set(deletes)],
			};

			for (let index = 0; index < plannedWrites.length; index++) {
				const planned = plannedWrites[index];
				const staged = `${stageDir}/write-${index}.data`;
				let mode: PendingSessionWrite["mode"] = "replace";
				let stagedContent = planned.content;
				let prefix: string | undefined;
				if (planned.appendPrefixCount !== undefined) {
					const lines = planned.content.endsWith("\n")
						? planned.content.slice(0, -1).split("\n")
						: planned.content.split("\n");
					const prefixCount = planned.appendPrefixCount;
					prefix =
						prefixCount === 0
							? ""
							: `${lines.slice(0, prefixCount).join("\n")}\n`;
					const prefixBytes = new TextEncoder().encode(
						prefix,
					).byteLength;
					const targetFullPath = `${pluginDir}/${planned.target}`;
					const stat = await adapter.stat(targetFullPath);
					if (prefixBytes === 0 && !stat) {
						mode = "append";
						stagedContent = planned.content.slice(prefix.length);
					} else if (stat !== null && stat.size === prefixBytes) {
						const knownFingerprint =
							this.transcriptFingerprints.get(targetFullPath);
						if (
							knownFingerprint !== undefined &&
							knownFingerprint !== hashText(prefix)
						) {
							throw new Error(
								`Cannot append session transcript: verified disk prefix changed (${planned.target})`,
							);
						}
						if (knownFingerprint === hashText(prefix)) {
							mode = "append";
							stagedContent = planned.content.slice(
								prefix.length,
							);
						}
					}
				}
				if (mode === "append" && stagedContent.length === 0) continue;
				await adapter.write(`${pluginDir}/${staged}`, stagedContent);
				transaction.writes.push({
					target: planned.target,
					staged,
					mode,
					...(mode === "append" && prefix !== undefined
						? {
								prefixChars: prefix.length,
								prefixBytes: new TextEncoder().encode(prefix)
									.byteLength,
								prefixHash: hashText(prefix),
								finalHash: hashText(planned.content),
							}
						: {}),
				});
			}

			const journalPath = `${sessionsDir}/${PENDING_SAVE_FILE}`;
			const journalTempPath = `${journalPath}.tmp`;
			if (await adapter.exists(journalTempPath)) {
				await adapter.remove(journalTempPath);
			}
			await adapter.write(journalTempPath, JSON.stringify(transaction));
			await adapter.rename(journalTempPath, journalPath);
			await this._recoverPendingSessionWrite(pluginDir, true);
		} finally {
			this.activeSessionWriteStages.delete(fullStageDir);
		}
	}

	private async _recoverPendingSessionWrite(
		pluginDir: string,
		fastCommit = false,
	): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		const sessionsDir = `${pluginDir}/${SESSIONS_DIR}`;
		if (!(await adapter.exists(sessionsDir))) return;
		const journalPath = `${sessionsDir}/${PENDING_SAVE_FILE}`;
		const journalTempPath = `${journalPath}.tmp`;
		if (await adapter.exists(journalPath)) {
			let transaction: PendingSessionTransaction;
			try {
				transaction = JSON.parse(
					await adapter.read(journalPath),
				) as PendingSessionTransaction;
			} catch (error) {
				throw new Error(
					`Cannot load session storage: pending save journal is unreadable (${String(error)})`,
				);
			}
			if (
				!transaction ||
				typeof transaction !== "object" ||
				transaction.version !== 1 ||
				typeof transaction.stageDir !== "string" ||
				!isSessionRelativePath(transaction.stageDir) ||
				transaction.stageDir.split("/").length !== 2 ||
				!transaction.stageDir.startsWith(
					`${SESSIONS_DIR}/${PENDING_SAVE_PREFIX}`,
				) ||
				transaction.stageDir.includes("..") ||
				!Array.isArray(transaction.writes) ||
				!Array.isArray(transaction.deletes) ||
				transaction.writes.some(
					(write) =>
						!write ||
						typeof write !== "object" ||
						!isSessionRelativePath(write.target) ||
						!isSessionRelativePath(write.staged) ||
						write.target ===
							`${SESSIONS_DIR}/${PENDING_SAVE_FILE}` ||
						write.target.startsWith(`${transaction.stageDir}/`) ||
						!write.staged.startsWith(`${transaction.stageDir}/`) ||
						!(
							write.mode === "replace" || write.mode === "append"
						) ||
						(write.mode === "append" &&
							(!Number.isInteger(write.prefixChars) ||
								write.prefixChars! < 0 ||
								!Number.isInteger(write.prefixBytes) ||
								write.prefixBytes! < 0 ||
								typeof write.prefixHash !== "string" ||
								typeof write.finalHash !== "string")),
				) ||
				transaction.deletes.some(
					(path) =>
						!isSessionRelativePath(path) ||
						path === `${SESSIONS_DIR}/index.json` ||
						path.startsWith(`${transaction.stageDir}/`),
				)
			) {
				throw new Error(
					"Cannot load session storage: pending save journal failed validation",
				);
			}

			for (const write of transaction.writes) {
				const stagedPath = `${pluginDir}/${write.staged}`;
				const targetPath = `${pluginDir}/${write.target}`;
				if (!(await adapter.exists(stagedPath))) {
					throw new Error(
						`Cannot finish interrupted session save: staged file is missing (${write.staged})`,
					);
				}
				const stagedContent = await adapter.read(stagedPath);
				if (write.mode === "append" && fastCommit) {
					const stat = await adapter.stat(targetPath);
					const cachedPrefixHash =
						this.transcriptFingerprints.get(targetPath);
					const verifiedEmptyPrefix =
						write.prefixChars === 0 && !stat;
					if (
						(stat?.size ?? 0) === write.prefixBytes &&
						(cachedPrefixHash === write.prefixHash ||
							verifiedEmptyPrefix)
					) {
						await adapter.append(targetPath, stagedContent);
						if (write.target.endsWith(".jsonl")) {
							this.transcriptFingerprints.set(
								targetPath,
								write.finalHash!,
							);
						}
						continue;
					}
				}
				const targetExists = await adapter.exists(targetPath);
				const targetContent = targetExists
					? await adapter.read(targetPath)
					: "";
				if (write.mode === "replace") {
					if (targetContent !== stagedContent) {
						await adapter.write(targetPath, stagedContent);
					}
					if (write.target.endsWith(".jsonl")) {
						this.transcriptFingerprints.set(
							targetPath,
							hashText(stagedContent),
						);
					}
					continue;
				}

				const prefix = targetContent.slice(0, write.prefixChars);
				if (
					prefix.length !== write.prefixChars ||
					hashText(prefix) !== write.prefixHash ||
					new TextEncoder().encode(prefix).byteLength !==
						write.prefixBytes
				) {
					throw new Error(
						`Cannot finish interrupted session save: transcript prefix changed (${write.target})`,
					);
				}
				if (targetContent === prefix + stagedContent) {
					this.transcriptFingerprints.set(
						targetPath,
						hashText(targetContent),
					);
					continue;
				}
				if (targetContent === prefix) {
					await adapter.append(targetPath, stagedContent);
					this.transcriptFingerprints.set(
						targetPath,
						hashText(prefix + stagedContent),
					);
					continue;
				}
				if (!targetContent.startsWith(prefix)) {
					throw new Error(
						`Cannot finish interrupted session save: transcript prefix changed (${write.target})`,
					);
				}
				await adapter.write(targetPath, prefix + stagedContent);
				this.transcriptFingerprints.set(
					targetPath,
					hashText(prefix + stagedContent),
				);
			}

			// The index is staged last, so every indexed transcript is present
			// before the new index becomes authoritative. Deletes follow the index;
			// the journal makes both steps repeatable after an interruption.
			for (const path of transaction.deletes) {
				const fullPath = `${pluginDir}/${path}`;
				if (await adapter.exists(fullPath)) {
					if (typeof adapter.remove !== "function") {
						throw new Error(
							"Cannot finish interrupted session save: vault adapter does not support file removal",
						);
					}
					await adapter.remove(fullPath);
				}
				if (path.endsWith(".jsonl")) {
					this.transcriptFingerprints.delete(fullPath);
				}
			}
			await adapter.remove(journalPath);
			const stagePath = `${pluginDir}/${transaction.stageDir}`;
			if (await adapter.exists(stagePath)) {
				await adapter.rmdir(stagePath, true).catch((error) => {
					this.deps.logger?.log(
						"warn",
						`ChatStorage: could not remove completed save staging directory: ${String(error)}`,
					);
				});
			}
		}
		if (await adapter.exists(journalTempPath)) {
			await adapter.remove(journalTempPath);
		}

		// A crash while writing staged data, before the journal was published,
		// leaves only an unreferenced private staging directory. It is safe to
		// remove these directories because they are created solely by this writer.
		try {
			const listing = await adapter.list(sessionsDir);
			for (const folder of listing.folders) {
				if (
					!this.activeSessionWriteStages.has(folder) &&
					folder.startsWith(`${sessionsDir}/${PENDING_SAVE_PREFIX}`)
				) {
					await adapter.rmdir(folder, true);
				}
			}
		} catch (error) {
			this.deps.logger?.log(
				"warn",
				`ChatStorage: could not clean abandoned save staging folders: ${String(error)}`,
			);
		}
	}

	private async _loadMessages(path: string): Promise<ChatMessage[]> {
		return (await this._loadMessagesWithDetails(path)).messages;
	}

	private async _loadMessagesWithDetails(
		path: string,
	): Promise<LoadedSessionMessages> {
		const adapter = this.deps.app.vault.adapter;
		if (!(await adapter.exists(path))) {
			this.transcriptFingerprints.delete(path);
			return {
				messages: [],
				exactDuplicateCount: 0,
				invalidRecordCount: 0,
			};
		}
		const stat = await adapter.stat(path);
		if (stat && stat.size > MAX_SESSION_READ_BYTES) {
			this.transcriptFingerprints.delete(path);
			throw new SessionTooLargeError(path, stat.size);
		}
		const raw = await adapter.read(path);
		this.transcriptFingerprints.set(path, hashText(raw));
		if (!raw.trim()) {
			return {
				messages: [],
				exactDuplicateCount: 0,
				invalidRecordCount: 0,
			};
		}
		const lines = raw.split("\n").filter((l) => l.trim());
		const messages: ChatMessage[] = [];
		const seenById = new Map<string, string>();
		let exactDuplicates = 0;
		let invalidRecordCount = 0;
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
					const serialized = JSON.stringify(parsed);
					const prior = seenById.get(parsed.id);
					if (prior === serialized) {
						exactDuplicates++;
						continue;
					}
					if (prior === undefined)
						seenById.set(parsed.id, serialized);
					messages.push(parsed as ChatMessage);
				} else {
					invalidRecordCount++;
					this.deps.logger?.log(
						"warn",
						`ChatStorage: skipping malformed message line in ${path}`,
					);
				}
			} catch {
				invalidRecordCount++;
				this.deps.logger?.log(
					"warn",
					`ChatStorage: failed to parse message line in ${path}`,
				);
			}
		}
		if (exactDuplicates > 0) {
			this.deps.logger?.log(
				"warn",
				`ChatStorage: ignored ${exactDuplicates} exact duplicate message record(s) in ${path}`,
			);
		}
		return {
			messages,
			exactDuplicateCount: exactDuplicates,
			invalidRecordCount,
		};
	}
}
