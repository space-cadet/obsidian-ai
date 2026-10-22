import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContentPart } from "../types";
import type { ToolCall, ToolResult } from "../agent/types";
import type { ToolDisplayDescriptor } from "../agent/toolRegistry";
import { normalizeMaxParallelChatSessions } from "../settings";

export interface ChatRuntimeState {
	isStreaming: boolean;
	currentAiMessage: string;
	currentContentParts: ContentPart[];
	pendingToolCall: ToolCall | null;
	pendingToolDisplay: ToolDisplayDescriptor | null;
	controller: AbortController | null;
	resolveTool: ((result: ToolResult | null) => void) | null;
	runningTokenTotal: number;
}

export type ChatRuntimePatch = Partial<ChatRuntimeState>;

export type SessionRunReservationResult =
	| "reserved"
	| "already-running"
	| "limit-reached";

const defaultReservationOwner = {};
const reservationsByOwner = new WeakMap<object, Set<string>>();

function getSessionReservations(owner: object): Set<string> {
	let reservations = reservationsByOwner.get(owner);
	if (!reservations) {
		reservations = new Set<string>();
		reservationsByOwner.set(owner, reservations);
	}
	return reservations;
}

export const emptyChatRuntime: ChatRuntimeState = {
	isStreaming: false,
	currentAiMessage: "",
	currentContentParts: [],
	pendingToolCall: null,
	pendingToolDisplay: null,
	controller: null,
	resolveTool: null,
	runningTokenTotal: 0,
};

function isRuntimeIdle(runtime: ChatRuntimeState): boolean {
	return (
		!runtime.isStreaming &&
		!runtime.currentAiMessage &&
		runtime.currentContentParts.length === 0 &&
		!runtime.pendingToolCall &&
		!runtime.controller &&
		!runtime.resolveTool &&
		runtime.runningTokenTotal === 0
	);
}

export function useChatRuntimeState(
	activeSessionId: string | null,
	reservationOwner: object = defaultReservationOwner,
) {
	const [runtimeBySession, setRuntimeBySession] = useState<
		Record<string, ChatRuntimeState>
	>({});
	const runtimeBySessionRef = useRef(runtimeBySession);
	const sessionReservations = getSessionReservations(reservationOwner);

	useEffect(() => {
		runtimeBySessionRef.current = runtimeBySession;
	}, [runtimeBySession]);

	const getRuntime = useCallback(
		(sessionId: string | null | undefined): ChatRuntimeState => {
			if (!sessionId) return emptyChatRuntime;
			return runtimeBySessionRef.current[sessionId] ?? emptyChatRuntime;
		},
		[],
	);

	const patchRuntime = useCallback(
		(
			sessionId: string | null | undefined,
			patch:
				| ChatRuntimePatch
				| ((current: ChatRuntimeState) => ChatRuntimePatch),
		) => {
			if (!sessionId) return;
			const applyPatch = (
				current: Record<string, ChatRuntimeState>,
			): Record<string, ChatRuntimeState> => {
				const previous = current[sessionId] ?? emptyChatRuntime;
				const nextPatch =
					typeof patch === "function" ? patch(previous) : patch;
				const next = { ...previous, ...nextPatch };
				if (isRuntimeIdle(next)) {
					const { [sessionId]: _removed, ...rest } = current;
					return rest;
				}
				return { ...current, [sessionId]: next };
			};
			setRuntimeBySession((current) => {
				const next = applyPatch(current);
				runtimeBySessionRef.current = next;
				return next;
			});
		},
		[],
	);

	const clearRuntime = useCallback((sessionId: string | null | undefined) => {
		if (!sessionId) return;
		setRuntimeBySession((current) => {
			if (!current[sessionId]) return current;
			const { [sessionId]: _removed, ...rest } = current;
			return rest;
		});
		const { [sessionId]: _removed, ...rest } = runtimeBySessionRef.current;
		runtimeBySessionRef.current = rest;
	}, []);

	const abortRuntime = useCallback((sessionId: string | null | undefined) => {
		const runtime = sessionId
			? runtimeBySessionRef.current[sessionId]
			: null;
		runtime?.controller?.abort();
	}, []);

	const reserveSessionRun = useCallback(
		(
			sessionId: string,
			maxParallelSessions: number,
		): SessionRunReservationResult => {
			const activeSessionIds = new Set(sessionReservations);
			for (const [runningSessionId, runtime] of Object.entries(
				runtimeBySessionRef.current,
			)) {
				if (runtime.isStreaming || runtime.controller) {
					activeSessionIds.add(runningSessionId);
				}
			}

			if (activeSessionIds.has(sessionId)) return "already-running";

			const limit = normalizeMaxParallelChatSessions(maxParallelSessions);
			if (activeSessionIds.size >= limit) return "limit-reached";

			sessionReservations.add(sessionId);
			return "reserved";
		},
		[sessionReservations],
	);

	const releaseSessionRun = useCallback(
		(sessionId: string) => {
			sessionReservations.delete(sessionId);
		},
		[sessionReservations],
	);

	const activeRuntime = useMemo(
		() => getRuntime(activeSessionId),
		[getRuntime, activeSessionId, runtimeBySession],
	);

	return {
		runtimeBySession,
		activeRuntime,
		getRuntime,
		patchRuntime,
		clearRuntime,
		abortRuntime,
		reserveSessionRun,
		releaseSessionRun,
	};
}
