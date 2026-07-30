import { useState, useCallback, useEffect, useRef } from "react";
import { WorkspaceLeaf, MarkdownView } from "obsidian";
import type { ChatPluginLike } from "../views/ObsidianAIChatView";
import type { ChatSession, ContextItem } from "../types";
import { sameContextItems, contextItemKey } from "../lib/contextUtils";
import { makeId } from "../lib/sessionUtils";

export interface UseContextItemsResult {
	contextItems: ContextItem[];
	setContextItems: React.Dispatch<React.SetStateAction<ContextItem[]>>;
	targetNoteName: string | null;
	setTargetNoteName: React.Dispatch<React.SetStateAction<string | null>>;
	handleToggleActiveNote: () => void;
	handleRemoveContextItem: (id: string) => void;
	handleAddMention: (item: ContextItem) => void;
	handleAddContextItems: (items: ContextItem[]) => void;
}

export function useContextItems(
	plugin: ChatPluginLike,
	sessionsRef: React.MutableRefObject<ChatSession[]>,
	activeSessionIdRef: React.MutableRefObject<string | null>,
	setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>,
	setWasTruncated: (v: boolean) => void,
	onCloseContextPicker: () => void,
): UseContextItemsResult {
	const [contextItems, setContextItems] = useState<ContextItem[]>([]);
	const [targetNoteName, setTargetNoteName] = useState<string | null>(null);
	const contextItemsRef = useRef<ContextItem[]>([]);
	contextItemsRef.current = contextItems;

	// Track last focused markdown leaf
	const lastMarkdownLeafRef = useRef<WorkspaceLeaf | null>(null);

	useEffect(() => {
		const initLeaf =
			plugin.app.workspace.getLeavesOfType("markdown")[0] ?? null;
		if (initLeaf?.view instanceof MarkdownView) {
			lastMarkdownLeafRef.current = initLeaf;
			setTargetNoteName(
				(initLeaf.view as MarkdownView).file?.basename ?? null,
			);
		}

		const onLeafChange = (leaf: WorkspaceLeaf | null) => {
			if (leaf?.view instanceof MarkdownView) {
				lastMarkdownLeafRef.current = leaf;
				setTargetNoteName(
					(leaf.view as MarkdownView).file?.basename ?? null,
				);
			}
		};

		plugin.app.workspace.on("active-leaf-change", onLeafChange as any);
		return () =>
			plugin.app.workspace.off("active-leaf-change", onLeafChange as any);
	}, [plugin]);

	// Sync contextItems when active session changes
	const prevActiveSessionIdRef = useRef<string | null>(null);
	useEffect(() => {
		const activeSessionId = activeSessionIdRef.current;
		if (activeSessionId === prevActiveSessionIdRef.current) return;
		prevActiveSessionIdRef.current = activeSessionId;
		const s = sessionsRef.current.find((s) => s.id === activeSessionId);
		const sessionItems = s?.contextItems ?? [];
		if (!sameContextItems(contextItemsRef.current, sessionItems)) {
			setContextItems(sessionItems);
		}
		setWasTruncated(false);
	}, [activeSessionIdRef, sessionsRef, setWasTruncated]);

	// Persist contextItems to the current session whenever they change
	useEffect(() => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		setSessions((prev) => {
			const s = prev.find((s) => s.id === currentActiveId);
			if (s && sameContextItems(s.contextItems, contextItems)) {
				return prev;
			}
			return prev.map((s) =>
				s.id === currentActiveId ? { ...s, contextItems } : s,
			);
		});
		setWasTruncated(false);
	}, [contextItems, activeSessionIdRef, setSessions, setWasTruncated]);

	const handleToggleActiveNote = useCallback(() => {
		setContextItems((prev) => {
			const hasActive = prev.some((i) => i.type === "active-note");
			if (hasActive) {
				return prev.filter((i) => i.type !== "active-note");
			}
			return [...prev, { type: "active-note", id: makeId() }];
		});
	}, []);

	const handleRemoveContextItem = useCallback((id: string) => {
		setContextItems((prev) => prev.filter((i) => i.id !== id));
	}, []);

	const handleAddContextItems = useCallback(
		(items: ContextItem[]) => {
			setContextItems((prev) => {
				const existing = new Set(
					prev.map((i) => {
						if (i.type === "note") return `note:${i.path}`;
						if (i.type === "folder") return `folder:${i.path}`;
						if (i.type === "tag") return `tag:${i.tag}`;
						return `active:${i.id}`;
					}),
				);
				const merged = [...prev];
				for (const item of items) {
					const key =
						item.type === "note"
							? `note:${item.path}`
							: item.type === "folder"
								? `folder:${item.path}`
								: item.type === "tag"
									? `tag:${item.tag}`
									: `active:${item.id}`;
					if (!existing.has(key)) {
						existing.add(key);
						merged.push(item);
					}
				}
				return merged;
			});
			onCloseContextPicker();
		},
		[onCloseContextPicker],
	);

	const handleAddMention = useCallback(
		(item: ContextItem) => {
			handleAddContextItems([item]);
		},
		[handleAddContextItems],
	);

	return {
		contextItems,
		setContextItems,
		targetNoteName,
		setTargetNoteName,
		handleToggleActiveNote,
		handleRemoveContextItem,
		handleAddMention,
		handleAddContextItems,
	};
}
