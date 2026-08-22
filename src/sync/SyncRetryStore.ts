export type SyncRetryScope = "chat-session" | "plugin-data";

export interface SyncRetryRecord {
	scope: SyncRetryScope;
	itemId: string;
	identity: string;
	attempts: number;
	lastError: string;
	lastAttemptAt: number;
	nextRetryAt: number;
}

export interface SyncRetryDataStorage {
	load(): Promise<Record<string, unknown> | null>;
	save(data: Record<string, unknown>): Promise<void>;
}

interface PersistedRetryData {
	schemaVersion: 1;
	identity: string;
	records: Record<string, SyncRetryRecord>;
}

const RETRY_DATA_KEY = "syncRetryRecords";

/**
 * Small durable retry queue stored with plugin data. The queue is scoped to
 * one complete sync identity, so changing destination or encryption setup
 * cannot replay failures from another destination.
 */
export class DurableSyncRetryStore {
	private records: Record<string, SyncRetryRecord> = {};
	private loaded = false;
	private operation: Promise<void> = Promise.resolve();

	constructor(
		private readonly storage: SyncRetryDataStorage,
		private readonly identity: string,
		private readonly now: () => number = Date.now,
	) {}

	private key(scope: SyncRetryScope, itemId: string): string {
		return `${scope}:${itemId}`;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.loaded) return;
		this.loaded = true;
		const data = await this.storage.load();
		const persisted = data?.[RETRY_DATA_KEY] as
			| PersistedRetryData
			| undefined;
		if (
			persisted?.schemaVersion === 1 &&
			persisted.identity === this.identity &&
			persisted.records
		) {
			this.records = { ...persisted.records };
		}
	}

	private async mutate(callback: () => void): Promise<void> {
		const previous = this.operation;
		let release!: () => void;
		this.operation = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			await this.ensureLoaded();
			callback();
			const data = ((await this.storage.load()) ?? {}) as Record<
				string,
				unknown
			>;
			data[RETRY_DATA_KEY] = {
				schemaVersion: 1,
				identity: this.identity,
				records: this.records,
			} satisfies PersistedRetryData;
			await this.storage.save(data);
		} finally {
			release();
		}
	}

	async record(
		scope: SyncRetryScope,
		itemId: string,
		error: string,
	): Promise<SyncRetryRecord> {
		let record!: SyncRetryRecord;
		await this.mutate(() => {
			const key = this.key(scope, itemId);
			const previous = this.records[key];
			const attempts = (previous?.attempts ?? 0) + 1;
			const lastAttemptAt = this.now();
			const delay = Math.min(
				60 * 60 * 1000,
				1000 * 2 ** Math.min(attempts - 1, 10),
			);
			record = {
				scope,
				itemId,
				identity: this.identity,
				attempts,
				lastError: error,
				lastAttemptAt,
				nextRetryAt: lastAttemptAt + delay,
			};
			this.records[key] = record;
		});
		return record;
	}

	async clear(scope: SyncRetryScope, itemId: string): Promise<void> {
		await this.mutate(() => {
			delete this.records[this.key(scope, itemId)];
		});
	}

	async list(): Promise<SyncRetryRecord[]> {
		await this.ensureLoaded();
		return Object.values(this.records).sort(
			(a, b) => a.nextRetryAt - b.nextRetryAt,
		);
	}
}
