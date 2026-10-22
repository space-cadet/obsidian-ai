import type {
	ChatMessage,
	ChatSession,
	SessionHydrationResult,
	StoredChatData,
} from "../types";

const SAVE_DEBOUNCE_MS = 150;
const MAX_SAVE_RETRY_DELAY_MS = 30_000;

export interface SessionStateSnapshot {
	sessions: ChatSession[];
	activeSessionId: string | null;
	openSessionIds?: string[];
	deletedSessionIds: string[];
	ready: boolean;
}

export interface SessionStateStorage {
	load(): Promise<StoredChatData>;
	hydrate(sessionId: string): Promise<ChatMessage[]>;
	hydrateWithMetadata?(sessionId: string): Promise<SessionHydrationResult>;
	peek?(sessionId: string): Promise<ChatMessage[]>;
	save(data: StoredChatData): Promise<void>;
}

/** Plugin-scoped coordination for the existing session archive. */
export class SessionStateOwner {
	private snapshot: SessionStateSnapshot = {
		sessions: [],
		activeSessionId: null,
		deletedSessionIds: [],
		ready: false,
	};
	private listeners = new Set<() => void>();
	private activeSessionIdsByView = new Map<object, string>();
	private revisions = new Map<string, number>();
	private persistedRevisions = new Map<string, number>();
	private pendingLoads = new Map<string, Promise<ChatSession | null>>();
	private pendingInitialization: Promise<SessionStateSnapshot> | null = null;
	private deleted = new Set<string>();
	// A durable local delete must also reject downloads that finish later.
	private removedSessionIds = new Set<string>();
	private saveTail: Promise<void> = Promise.resolve();
	private generation = 0;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private saveRetryDelayMs = SAVE_DEBOUNCE_MS;

	constructor(private readonly storage: SessionStateStorage) {}

	getSnapshot = (): SessionStateSnapshot => this.snapshot;
	getServerSnapshot = (): SessionStateSnapshot => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private publish(next: SessionStateSnapshot): void {
		this.snapshot = next;
		for (const listener of this.listeners) listener();
	}

	initialize(): Promise<SessionStateSnapshot> {
		if (this.snapshot.ready) return Promise.resolve(this.snapshot);
		if (this.pendingInitialization) return this.pendingInitialization;
		const pending = this.loadInitialState().finally(() => {
			if (this.pendingInitialization === pending)
				this.pendingInitialization = null;
		});
		this.pendingInitialization = pending;
		return pending;
	}

	private async loadInitialState(): Promise<SessionStateSnapshot> {
		const generation = this.generation;
		const data = await this.storage.load();
		if (generation !== this.generation || this.snapshot.ready)
			return this.snapshot;
		for (const id of data.deletedSessionIds ?? []) this.deleted.add(id);
		this.publish({
			sessions: data.sessions.filter(
				(session) => !this.deleted.has(session.id),
			),
			activeSessionId: data.activeSessionId,
			openSessionIds: data.openSessionIds,
			deletedSessionIds: [...this.deleted],
			ready: true,
		});
		return this.snapshot;
	}

	async ensureLoaded(sessionId: string): Promise<ChatSession | null> {
		await this.initialize();
		const current = this.snapshot.sessions.find(
			(session) => session.id === sessionId,
		);
		if (!current || this.deleted.has(sessionId)) return null;
		if (current.hydrated !== false) return current;
		const inFlight = this.pendingLoads.get(sessionId);
		if (inFlight) return inFlight;
		const revision = this.revisions.get(sessionId) ?? 0;
		let reloadSupersedingSnapshot = false;
		const load = (
			this.storage.hydrateWithMetadata
				? this.storage.hydrateWithMetadata(sessionId)
				: this.storage.hydrate(sessionId).then((messages) => ({
						messages,
						indexedMessageCount:
							current.messageCount ?? messages.length,
						exactDuplicateCount: 0,
						invalidRecordCount: 0,
						countMismatchExplainedByExactDeduplication: false,
					}))
		)
			.then(async (result) => {
				let messages = result.messages;
				if (
					messages.length === 0 &&
					(current.messageCount ?? 0) > 0 &&
					this.storage.peek
				) {
					messages = await this.storage.peek(sessionId);
					return {
						...result,
						messages,
						exactDuplicateCount: 0,
						countMismatchExplainedByExactDeduplication: false,
					};
				}
				return result;
			})
			.then((result) => {
				const { messages } = result;
				const latest = this.snapshot.sessions.find(
					(session) => session.id === sessionId,
				);
				if (!latest || this.deleted.has(sessionId)) return null;
				if ((this.revisions.get(sessionId) ?? 0) !== revision) {
					reloadSupersedingSnapshot = latest.hydrated === false;
					return latest;
				}
				const duplicateOnlyReduction =
					result.countMismatchExplainedByExactDeduplication &&
					(latest.messageCount ?? result.indexedMessageCount) ===
						result.indexedMessageCount;
				if (
					messages.length < (latest.messageCount ?? 0) &&
					!duplicateOnlyReduction
				)
					return latest;
				const loaded = {
					...latest,
					messages,
					messageCount: messages.length,
					hydrated: true,
				};
				this.publish({
					...this.snapshot,
					sessions: this.snapshot.sessions.map((session) =>
						session.id === sessionId ? loaded : session,
					),
				});
				return loaded;
			})
			.finally(() => {
				this.pendingLoads.delete(sessionId);
				if (reloadSupersedingSnapshot && !this.deleted.has(sessionId)) {
					queueMicrotask(() => void this.ensureLoaded(sessionId));
				}
			});
		this.pendingLoads.set(sessionId, load);
		return load;
	}

	updateMetadata(
		sessionId: string,
		patch: Partial<Omit<ChatSession, "id" | "messages">>,
	): ChatSession | null {
		return this.update(sessionId, (session) => ({
			...session,
			...patch,
			id: session.id,
			messages: session.messages,
		}));
	}

	addSession(session: ChatSession): void {
		this.removedSessionIds.delete(session.id);
		if (this.deleted.has(session.id)) this.deleted.delete(session.id);
		this.revisions.set(
			session.id,
			(this.revisions.get(session.id) ?? 0) + 1,
		);
		this.publish({
			...this.snapshot,
			sessions: [
				...this.snapshot.sessions.filter(
					(item) => item.id !== session.id,
				),
				session,
			],
		});
		this.scheduleFlush();
	}

	setActiveSessionId(sessionId: string | null): void {
		this.publish({ ...this.snapshot, activeSessionId: sessionId });
		this.scheduleFlush();
	}

	setViewActiveSessionId(viewId: object, sessionId: string | null): void {
		if (sessionId) this.activeSessionIdsByView.set(viewId, sessionId);
		else this.activeSessionIdsByView.delete(viewId);
	}

	removeActiveSessionView(viewId: object): void {
		this.activeSessionIdsByView.delete(viewId);
	}

	isSessionActive(sessionId: string): boolean {
		return [...this.activeSessionIdsByView.values()].includes(sessionId);
	}

	setOpenSessionIds(sessionIds: string[]): void {
		this.publish({ ...this.snapshot, openSessionIds: sessionIds });
		this.scheduleFlush();
	}

	updateMessages(
		sessionId: string,
		change: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[]),
	): ChatSession | null {
		const session = this.snapshot.sessions.find(
			(item) => item.id === sessionId,
		);
		if (
			!session ||
			session.hydrated === false ||
			this.deleted.has(sessionId)
		)
			return null;
		const messages =
			typeof change === "function" ? change(session.messages) : change;
		return this.update(sessionId, (current) => ({
			...current,
			messages,
			messageCount: messages.length,
			hydrated: true,
			updatedAt: Date.now(),
		}));
	}

	appendMessage(sessionId: string, message: ChatMessage): ChatSession | null {
		return this.updateMessages(sessionId, (messages) => [
			...messages,
			message,
		]);
	}

	private update(
		sessionId: string,
		change: (session: ChatSession) => ChatSession,
	): ChatSession | null {
		const before = this.snapshot.sessions.find(
			(session) => session.id === sessionId,
		);
		if (!before || this.deleted.has(sessionId)) return null;
		const next = change(before);
		this.revisions.set(sessionId, (this.revisions.get(sessionId) ?? 0) + 1);
		this.publish({
			...this.snapshot,
			sessions: this.snapshot.sessions.map((session) =>
				session.id === sessionId ? next : session,
			),
		});
		this.scheduleFlush();
		return next;
	}

	async deleteSession(sessionId: string): Promise<void> {
		this.markDeleted(sessionId);
		if (this.saveTimer) clearTimeout(this.saveTimer);
		await this.flush();
		this.deleted.delete(sessionId);
		this.publish({
			...this.snapshot,
			deletedSessionIds: [...this.deleted],
		});
	}

	async deleteAllSessions(): Promise<void> {
		for (const session of this.snapshot.sessions) {
			this.deleted.add(session.id);
			this.removedSessionIds.add(session.id);
		}
		this.generation++;
		for (const session of this.snapshot.sessions) {
			this.revisions.set(
				session.id,
				(this.revisions.get(session.id) ?? 0) + 1,
			);
		}
		this.publish({
			...this.snapshot,
			sessions: [],
			activeSessionId: null,
			openSessionIds: [],
			deletedSessionIds: [...this.deleted],
		});
		if (this.saveTimer) clearTimeout(this.saveTimer);
		await this.flush();
		this.publish({
			...this.snapshot,
			deletedSessionIds: [...this.deleted],
		});
	}

	markDeleted(sessionId: string): void {
		this.removedSessionIds.add(sessionId);
		this.deleted.add(sessionId);
		this.generation++;
		this.revisions.set(sessionId, (this.revisions.get(sessionId) ?? 0) + 1);
		this.publish({
			...this.snapshot,
			sessions: this.snapshot.sessions.filter(
				(session) => session.id !== sessionId,
			),
			deletedSessionIds: [...this.deleted],
			activeSessionId:
				this.snapshot.activeSessionId === sessionId
					? null
					: this.snapshot.activeSessionId,
			openSessionIds: this.snapshot.openSessionIds?.filter(
				(id) => id !== sessionId,
			),
		});
		this.scheduleFlush();
	}

	discardDraft(sessionId: string): void {
		if (!this.snapshot.sessions.some((session) => session.id === sessionId))
			return;
		this.generation++;
		this.revisions.set(sessionId, (this.revisions.get(sessionId) ?? 0) + 1);
		this.publish({
			...this.snapshot,
			sessions: this.snapshot.sessions.filter(
				(session) => session.id !== sessionId,
			),
			activeSessionId:
				this.snapshot.activeSessionId === sessionId
					? null
					: this.snapshot.activeSessionId,
			openSessionIds: this.snapshot.openSessionIds?.filter(
				(id) => id !== sessionId,
			),
		});
		this.scheduleFlush();
	}

	captureSyncRevisions(): ReadonlyMap<string, number> {
		return new Map(this.revisions);
	}

	applySyncSnapshot(
		data: StoredChatData,
		baseline?: ReadonlyMap<string, number>,
	): string[] {
		const skipped: string[] = [];
		for (const id of data.deletedSessionIds ?? []) this.deleted.add(id);
		const currentById = new Map(
			this.snapshot.sessions.map((session) => [session.id, session]),
		);
		const incomingById = new Map(
			data.sessions.map((session) => [session.id, session]),
		);
		const merged = [...currentById.values()].filter(
			(session) => !this.deleted.has(session.id),
		);
		for (const incoming of incomingById.values()) {
			if (
				this.deleted.has(incoming.id) ||
				this.removedSessionIds.has(incoming.id)
			) {
				skipped.push(incoming.id);
				continue;
			}
			if (
				baseline &&
				(this.revisions.get(incoming.id) ?? 0) !==
					(baseline.get(incoming.id) ?? 0)
			) {
				skipped.push(incoming.id);
				continue;
			}
			const current = currentById.get(incoming.id);
			if (
				!baseline &&
				current &&
				incoming.updatedAt < current.updatedAt
			) {
				skipped.push(incoming.id);
				continue;
			}
			if (!current) merged.push(incoming);
			else if (
				(this.revisions.get(incoming.id) ?? 0) ===
				(this.persistedRevisions.get(incoming.id) ?? 0)
			) {
				const refreshed =
					incoming.messages.length === 0 &&
					current.hydrated !== false &&
					incoming.messageCount === current.messageCount &&
					incoming.updatedAt <= current.updatedAt
						? {
								...incoming,
								messages: current.messages,
								messageCount: current.messageCount,
								hydrated: true,
							}
						: current.hydrated === false &&
							  incoming.messages.length === 0
							? {
									...incoming,
									messages: current.messages,
									hydrated: false,
								}
							: incoming;
				merged[
					merged.findIndex((session) => session.id === incoming.id)
				] = refreshed;
				if (
					incoming.hydrated !== false ||
					incoming.messages.length > 0 ||
					incoming.updatedAt !== current.updatedAt ||
					incoming.messageCount !== current.messageCount ||
					incoming.title !== current.title
				) {
					this.revisions.set(
						incoming.id,
						(this.revisions.get(incoming.id) ?? 0) + 1,
					);
				}
			} else skipped.push(incoming.id);
		}
		this.publish({
			...this.snapshot,
			sessions: merged,
			activeSessionId: data.activeSessionId,
			openSessionIds: data.openSessionIds,
			deletedSessionIds: [...this.deleted],
		});
		this.scheduleFlush();
		return skipped;
	}

	private scheduleFlush(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.flush().catch(() => {
				this.saveRetryDelayMs = Math.min(
					this.saveRetryDelayMs * 2,
					MAX_SAVE_RETRY_DELAY_MS,
				);
				this.scheduleFlush();
			});
		}, this.saveRetryDelayMs);
	}

	async flush(): Promise<void> {
		if (!this.snapshot.ready) {
			await this.initialize();
			if (!this.snapshot.ready)
				throw new Error("Session archive is not ready for saving");
		}
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		const revisions = new Map(this.revisions);
		const data: StoredChatData = {
			sessions: this.snapshot.sessions,
			activeSessionId: this.snapshot.activeSessionId,
			openSessionIds: this.snapshot.openSessionIds,
			deletedSessionIds: [...this.deleted],
		};
		const operation = this.saveTail.then(() => this.storage.save(data));
		this.saveTail = operation.catch(() => undefined);
		await operation;
		this.saveRetryDelayMs = SAVE_DEBOUNCE_MS;
		for (const [id, revision] of revisions)
			this.persistedRevisions.set(id, revision);
		for (const id of data.deletedSessionIds ?? []) this.deleted.delete(id);
		if (data.deletedSessionIds?.length) {
			this.publish({
				...this.snapshot,
				deletedSessionIds: [...this.deleted],
			});
		}
	}
}
