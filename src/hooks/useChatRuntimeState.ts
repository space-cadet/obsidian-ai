import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContentPart } from "../types";
import type { ToolCall, ToolResult } from "../agent/types";
import type { ToolDisplayDescriptor } from "../agent/toolRegistry";

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

export function useChatRuntimeState(activeSessionId: string | null) {
	const [runtimeBySession, setRuntimeBySession] = useState<
		Record<string, ChatRuntimeState>
	>({});
	const runtimeBySessionRef = useRef(runtimeBySession);

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
	};
}
