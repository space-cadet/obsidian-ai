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
	let total = 0;
	let pendingUserTokens = 0;
	for (const message of session.messages) {
		if (message.role === "user") {
			pendingUserTokens += message.estimatedTokens || 0;
			continue;
		}
		const providerTotal = message.providerUsage?.totalTokens;
		if (Number.isFinite(providerTotal)) {
			total += providerTotal!;
			pendingUserTokens = 0;
		} else if (message.requestTokenEstimate !== undefined) {
			total +=
				Math.max(0, message.requestTokenEstimate) +
				(message.estimatedTokens || 0);
			pendingUserTokens = 0;
		} else {
			total += pendingUserTokens + (message.estimatedTokens || 0);
			pendingUserTokens = 0;
		}
	}
	return total + pendingUserTokens;
}
