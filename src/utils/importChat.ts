import type { ChatMessage, ChatSession } from "../types";
import { normalizeSessionTags } from "../lib/sessionTags";

type SessionRecord = Record<string, unknown>;

function isRecord(value: unknown): value is SessionRecord {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isMessage(value: unknown): value is SessionRecord {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		["user", "assistant", "system"].includes(String(value.role)) &&
		typeof value.content === "string" &&
		typeof value.timestamp === "number"
	);
}

function isSession(value: unknown): value is SessionRecord & {
	messages: unknown[];
} {
	return isRecord(value) && Array.isArray(value.messages);
}

function sanitizeMessage(value: unknown): ChatMessage {
	if (!isMessage(value))
		throw new Error("A chat export contains an invalid message.");
	const {
		_debugTelemetry: _debugTelemetry,
		_sessionMetadata: _sessionMetadata,
		...message
	} = value;
	return message as unknown as ChatMessage;
}

function sanitizeSession(
	value: SessionRecord,
	messagesOverride?: unknown[],
	fallbackTitle = "Imported chat",
): ChatSession {
	const {
		_debugTelemetry: _debugTelemetry,
		_sessionMetadata: _sessionMetadata,
		_recordType: _recordType,
		_syncStatus: _syncStatus,
		_localModifiedAt: _localModifiedAt,
		_remoteModifiedAt: _remoteModifiedAt,
		_etag: _etag,
		_version: _version,
		...metadata
	} = value;
	const rawMessages = messagesOverride ?? value.messages;
	if (!Array.isArray(rawMessages))
		throw new Error("A chat export is missing its message list.");
	const messages = rawMessages.map(sanitizeMessage);
	const createdAt =
		typeof metadata.createdAt === "number" &&
		Number.isFinite(metadata.createdAt)
			? metadata.createdAt
			: Date.now();
	const id =
		typeof metadata.id === "string" &&
		/^[a-zA-Z0-9_-]{1,128}$/.test(metadata.id)
			? metadata.id
			: crypto.randomUUID();
	return {
		...(metadata as Partial<ChatSession>),
		id,
		title:
			typeof metadata.title === "string" && metadata.title.trim()
				? metadata.title
				: fallbackTitle,
		createdAt,
		updatedAt:
			typeof metadata.updatedAt === "number" &&
			Number.isFinite(metadata.updatedAt)
				? metadata.updatedAt
				: createdAt,
		messages,
		messageCount: messages.length,
		hydrated: true,
		contextItems: Array.isArray(metadata.contextItems)
			? (metadata.contextItems as ChatSession["contextItems"])
			: [],
		tags: normalizeSessionTags(metadata.tags),
		// Importing a session must not trigger an unexpected provider request.
		autoTagPending: false,
	};
}

function parseJsonArchive(value: unknown): ChatSession[] | null {
	if (isRecord(value) && Array.isArray(value.sessions)) {
		return value.sessions.map((session) => {
			if (!isSession(session))
				throw new Error("A chat export contains an invalid session.");
			return sanitizeSession(session);
		});
	}
	if (isSession(value)) return [sanitizeSession(value)];
	return null;
}

/** Parse the JSON and JSONL formats produced by Chat History export. */
export function parseSessionArchive(
	text: string,
	fallbackTitle = "Imported chat",
): ChatSession[] {
	if (!text.trim()) throw new Error("The selected file is empty.");
	try {
		const parsed = parseJsonArchive(JSON.parse(text));
		if (parsed) {
			if (!parsed.length)
				throw new Error("The chat export contains no sessions.");
			return parsed;
		}
	} catch (error) {
		if (
			error instanceof Error &&
			(error.message.includes("invalid session") ||
				error.message.includes("no sessions"))
		)
			throw error;
		// JSONL is parsed record by record below.
	}

	const records: SessionRecord[] = text
		.split(/\r?\n/)
		.map((line, index) => ({ line: line.trim(), index }))
		.filter(({ line }) => line.length > 0)
		.map(({ line, index }) => {
			try {
				const parsed: unknown = JSON.parse(line);
				if (!isRecord(parsed)) throw new Error("not an object");
				return parsed;
			} catch {
				throw new Error(`Invalid JSONL record on line ${index + 1}.`);
			}
		});
	if (!records.length)
		throw new Error("The chat export contains no records.");

	const exportedSessions: ChatSession[] = [];
	const messageRecords: SessionRecord[] = [];
	let sessionMetadata: SessionRecord | undefined;
	for (const record of records) {
		if (isSession(record)) {
			exportedSessions.push(
				sanitizeSession(record, undefined, fallbackTitle),
			);
			continue;
		}
		if (
			record._recordType === "session" &&
			isRecord(record._sessionMetadata)
		) {
			exportedSessions.push(
				sanitizeSession(record._sessionMetadata, [], fallbackTitle),
			);
			continue;
		}
		if (isMessage(record)) {
			if (!sessionMetadata && isRecord(record._sessionMetadata))
				sessionMetadata = record._sessionMetadata;
			messageRecords.push(record);
			continue;
		}
		throw new Error(
			"The selected file is not a saved-chat JSON or JSONL export.",
		);
	}
	if (messageRecords.length) {
		exportedSessions.push(
			sanitizeSession(
				sessionMetadata ?? {},
				messageRecords,
				fallbackTitle,
			),
		);
	}
	if (!exportedSessions.length)
		throw new Error("The chat export contains no sessions.");
	return exportedSessions;
}

/** Keep existing sessions intact when an imported archive reuses their IDs. */
export function makeImportedSessionsUnique(
	sessions: ChatSession[],
	existingIds: ReadonlySet<string>,
	createId: () => string = () => crypto.randomUUID(),
): { sessions: ChatSession[]; copiedIdCount: number } {
	const usedIds = new Set(existingIds);
	let copiedIdCount = 0;
	const uniqueSessions = sessions.map((session) => {
		let id = session.id;
		if (usedIds.has(id)) {
			do {
				id = createId();
			} while (usedIds.has(id));
			copiedIdCount++;
		}
		usedIds.add(id);
		return id === session.id ? session : { ...session, id };
	});
	return { sessions: uniqueSessions, copiedIdCount };
}
