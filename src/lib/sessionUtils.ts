import { ChatSession } from "../types";

export function makeId(): string {
	return crypto.randomUUID();
}

export function pruneSessions(
	sessions: ChatSession[],
	max: number,
	activeId: string | null,
): ChatSession[] {
	if (sessions.length <= max) return sessions;
	const sorted = [...sessions].sort((a, b) => a.updatedAt - b.updatedAt);
	const toRemove = sorted.slice(0, sessions.length - max);
	const removeIds = new Set(toRemove.map((s) => s.id));
	// Never prune the active session
	if (activeId) removeIds.delete(activeId);
	return sessions.filter((s) => !removeIds.has(s.id));
}

export function getSessionTotalTokens(session: ChatSession): number {
	return session.messages.reduce((sum, m) => sum + (m.estimatedTokens || 0), 0);
}
