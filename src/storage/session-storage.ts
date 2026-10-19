import type { App } from "obsidian";
import type { ChatMessage } from "../types";

export interface SessionStorageDeps {
	app: App;
	manifest: { id: string };
	logger?: { log(level: string, msg: string): void };
}

/** Read-only compatibility helper. Persistence is owned by ChatStorage. */
export class SessionStorage {
	private deps: SessionStorageDeps;
	private readonly sessionsDir: string;

	constructor(deps: SessionStorageDeps) {
		this.deps = deps;
		this.sessionsDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}/sessions`;
	}

	/** Read all messages from a session JSONL file. */
	async loadSession(sessionId: string): Promise<ChatMessage[]> {
		const adapter = this.deps.app.vault.adapter;
		const path = `${this.sessionsDir}/${sessionId}.jsonl`;

		try {
			if (!(await adapter.exists(path))) {
				return [];
			}
			const raw = await adapter.read(path);
			if (!raw.trim()) {
				return [];
			}
			const lines = raw.split("\n").filter((l) => l.trim());
			return lines.map((line) => JSON.parse(line) as ChatMessage);
		} catch (err) {
			this.log(
				"error",
				`SessionStorage.loadSession failed for ${sessionId}: ${err}`,
			);
			return [];
		}
	}

	/** Allocate an ID; ChatStorage creates the indexed transcript on first save. */
	async createSession(): Promise<string> {
		const sessionId = crypto.randomUUID();
		this.log(
			"info",
			`SessionStorage.createSession: allocated ${sessionId}`,
		);
		return sessionId;
	}

	private log(level: string, msg: string): void {
		this.deps.logger?.log(level, msg);
	}
}
