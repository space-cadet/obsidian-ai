import type { ChatMessage, ChatSession, StoredChatData } from "../types";

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
	private revisions = new Map<string, number>();
	private persistedRevisions = new Map<string, number>();
	private pendingLoads = new Map<string, Promise<ChatSession | null>>();
	private deleted = new Set<string>();
	private saveTail: Promise<void> = Promise.resolve();
	private generation = 0;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

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

	async initialize(): Promise<SessionStateSnapshot> {
		if (this.snapshot.ready) return this.snapshot;
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
		const generation = this.generation;
		const load = this.storage
			.hydrate(sessionId)
			.then(async (messages) => {
				if (
					messages.length === 0 &&
					(current.messageCount ?? 0) > 0 &&
					this.storage.peek
				) {
					return this.storage.peek(sessionId);
				}
				return messages;
			})
			.then((messages) => {
				const latest = this.snapshot.sessions.find(
					(session) => session.id === sessionId,
				);
				if (
					!latest ||
					this.deleted.has(sessionId) ||
					generation !== this.generation
				)
					return null;
				if ((this.revisions.get(sessionId) ?? 0) !== revision)
					return latest;
				if (messages.length === 0 && (latest.messageCount ?? 0) > 0)
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
			.finally(() => this.pendingLoads.delete(sessionId));
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

	updateMessages(
		sessionId: string,
		messages: ChatMessage[],
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
		return this.update(sessionId, (current) => ({
			...current,
			messages,
			messageCount: messages.length,
			hydrated: true,
			updatedAt: Date.now(),
		}));
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

	markDeleted(sessionId: string): void {
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

	applySyncSnapshot(data: StoredChatData): void {
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
			if (this.deleted.has(incoming.id)) continue;
			const current = currentById.get(incoming.id);
			if (!current) merged.push(incoming);
			else if (
				(this.revisions.get(incoming.id) ?? 0) ===
				(this.persistedRevisions.get(incoming.id) ?? 0)
			) {
				merged[
					merged.findIndex((session) => session.id === incoming.id)
				] =
					current.hydrated === false && incoming.messages.length === 0
						? {
								...incoming,
								messages: current.messages,
								hydrated: false,
							}
						: incoming;
				if (
					incoming.hydrated !== false ||
					incoming.messages.length > 0
				) {
					this.revisions.set(
						incoming.id,
						(this.revisions.get(incoming.id) ?? 0) + 1,
					);
				}
			}
		}
		this.publish({
			...this.snapshot,
			sessions: merged,
			activeSessionId: data.activeSessionId,
			openSessionIds: data.openSessionIds,
			deletedSessionIds: [...this.deleted],
		});
		this.scheduleFlush();
	}

	/** Transitional snapshot import; callers should migrate to explicit operations. */
	replaceSnapshot(data: StoredChatData): void {
		const prior = new Map(
			this.snapshot.sessions.map((session) => [session.id, session]),
		);
		const sessions = data.sessions.filter(
			(session) => !this.deleted.has(session.id),
		);
		for (const session of sessions) {
			if (prior.get(session.id) !== session)
				this.revisions.set(
					session.id,
					(this.revisions.get(session.id) ?? 0) + 1,
				);
		}
		this.publish({
			...this.snapshot,
			sessions,
			activeSessionId: data.activeSessionId,
			openSessionIds: data.openSessionIds,
			deletedSessionIds: [...this.deleted],
			ready: true,
		});
		this.scheduleFlush();
	}

	private scheduleFlush(): void {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.flush().catch(() => this.scheduleFlush());
		}, 150);
	}

	async flush(): Promise<void> {
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
