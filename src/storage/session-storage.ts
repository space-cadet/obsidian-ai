import type { App } from "obsidian";
import type { ChatMessage } from "../types";

export interface SessionStorageDeps {
	app: App;
	manifest: { id: string };
	logger?: { log(level: string, msg: string): void };
}

/** Per-session JSONL storage — low-level read/write for individual session files. */
export class SessionStorage {
	private deps: SessionStorageDeps;
	private readonly sessionsDir: string;

	constructor(deps: SessionStorageDeps) {
		this.deps = deps;
		this.sessionsDir = `${this.deps.app.vault.configDir}/plugins/${this.deps.manifest.id}/sessions`;
	}

	/** Ensure the sessions directory exists. */
	async ensureDir(): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		if (!(await adapter.exists(this.sessionsDir))) {
			await adapter.mkdir(this.sessionsDir);
		}
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

	/** Append a single message to a session JSONL file. */
	async appendMessage(
		sessionId: string,
		message: ChatMessage,
	): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		const path = `${this.sessionsDir}/${sessionId}.jsonl`;

		try {
			await this.ensureDir();
			const line = JSON.stringify(message) + "\n";
			await adapter.append(path, line);
		} catch (err) {
			this.log(
				"error",
				`SessionStorage.appendMessage failed for ${sessionId}: ${err}`,
			);
			throw err;
		}
	}

	/** Create a new empty session file and return its UUID. */
	async createSession(): Promise<string> {
		const adapter = this.deps.app.vault.adapter;
		const sessionId = crypto.randomUUID();
		const path = `${this.sessionsDir}/${sessionId}.jsonl`;

		try {
			await this.ensureDir();
			await adapter.write(path, "");
			this.log(
				"info",
				`SessionStorage.createSession: created ${sessionId}`,
			);
			return sessionId;
		} catch (err) {
			this.log("error", `SessionStorage.createSession failed: ${err}`);
			throw err;
		}
	}

	/** Delete a session JSONL file. */
	async deleteSession(sessionId: string): Promise<void> {
		const adapter = this.deps.app.vault.adapter;
		const path = `${this.sessionsDir}/${sessionId}.jsonl`;

		try {
			if (await adapter.exists(path)) {
				await adapter.remove(path);
				this.log(
					"info",
					`SessionStorage.deleteSession: removed ${sessionId}`,
				);
			}
		} catch (err) {
			this.log(
				"error",
				`SessionStorage.deleteSession failed for ${sessionId}: ${err}`,
			);
			throw err;
		}
	}

	private log(level: string, msg: string): void {
		this.deps.logger?.log(level, msg);
	}
}
