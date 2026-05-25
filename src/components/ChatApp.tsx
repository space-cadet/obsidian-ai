import React, {
	useState,
	useRef,
	useCallback,
	useEffect,
	useMemo,
} from "react";
import { MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";

import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { NoteEditingBridge } from "../noteEditing/NoteEditingBridge";
import { ChatMessage, ChatSession, ContextItem, GroupChatParticipant, ContentPart } from "../types";
import { resolveContextItems } from "../context/ContextEngine";
import { estimateTokens } from "../context/tokenEstimator";
import { noteTools } from "../agent/tools";
import { ToolExecutor } from "../agent/ToolExecutor";
import { AgentLoop } from "../agent/AgentLoop";
import type { ToolCall, ToolResult } from "../agent/types";
import { Orchestrator, AgentResponse } from "../agent/Orchestrator";
import { parseMentions } from "../agent/MentionParser";
import ActionBar from "./ActionBar";
import ChatMessages from "./ChatMessages";
import ContextBar from "./ContextBar";
import ChatInput from "./ChatInput";
import SessionPickerModal from "./SessionPickerModal";
import ContextPickerModal from "./ContextPickerModal";
import ExportModal from "./ExportModal";
import PendingToolCard from "./PendingToolCard";
import ObsidianIcon from "./ObsidianIcon";
import { AgentApiManager } from "../api/AgentApiManager";
import { ChatApiManager } from "../api";
import { OpenResponsesLoop } from "../agent/OpenResponsesLoop";
import { noteToolsToOpenResponses } from "../agent/tools/toOpenResponses";
import {
	getActiveProviderProfile,
	ProviderProfile,
} from "../settings";
import { stripThinkingTags } from "./MessageBubble";

interface ChatAppProps {
	plugin: ChatPluginLike;
	/** Optional profile ID to use for this chat panel. Falls back to active profile. */
	profileId?: string;
}

function buildSystemPrompt(
	contextItems: ContextItem[],
	slashCmd?: SlashCommand,
	toolsEnabled = false,
): string {
	let prompt =
		"You are a helpful assistant integrated into an Obsidian note-taking app.";
	const hasActiveNote = contextItems.some((i) => i.type === "active-note");

	if (toolsEnabled) {
		prompt +=
			"\n\nYou have access to the following tools for managing Obsidian notes:" +
			"\n- read_note: Read the full content of a note. Use this before editing to understand current content." +
			"\n- edit_note: Overwrite the entire content of a note. Provide COMPLETE new content." +
			"\n- append_to_note: Add content to the end of a note without changing existing content." +
			"\n- create_note: Create a new note in the vault." +
			"\n- patch_note: Find and replace text inside a note (small precise edits)." +
			"\n- edit_section: Rewrite content under a specific heading." +
			"\n- search_notes: Search for notes by filename or path. Use sort_by=name|modified|created, limit, folder, and search_content params." +
			"\n- list_notes: Browse notes in the vault or a folder. Use sort_by=name|modified|created, limit, and include_subfolders (default true) params. Shows subfolders alongside files." +
			"\n- count_notes: Count files in a folder or the entire vault. Returns total files, markdown files, direct files, and subfolder counts. Use when the user asks how many notes/files exist or for folder statistics." +
			"\n- get_note_metadata: Get file stats (size, dates, word count) for a specific note." +
			"\n- create_folder: Create a new folder in the vault." +
			"\n- move_note: Move or rename a note to a new folder or name. Creates parent folders if needed." +
			"\n- delete_note: Delete a note from the vault." +
			"\n- list_folders: List folders in the vault. Use to understand vault structure." +
			"\n- search_web: Search the web for current information. Use when the user asks about recent events, news, or facts that may have changed since your training data." +
			"\n\nWhen the user asks to find, list, or search for notes, ALWAYS use search_notes or list_notes first." +
			" Do not say you cannot search — you have the search_notes and list_notes tools." +
			" Before editing a note you are unfamiliar with, use read_note to see its current content." +
			"\n\nImportant: When using edit_note, provide the COMPLETE new note content. Do not use diff syntax or markdown code blocks." +
			"\n\nFor moving notes: use move_note(path, new_path). Parent folders are created automatically if needed." +
			"\nFor creating folders: use create_folder(path). Then use move_note to place notes inside.";
	}

	if (slashCmd) {
		switch (slashCmd.command) {
			case "edit":
				prompt += `\n\nThe user wants to edit the note "${slashCmd.target}". Return ONLY the complete revised note content. Do not wrap it in markdown code blocks or add explanations.`;
				break;
			case "create":
				prompt += `\n\nThe user wants to create a new note named "${slashCmd.target}". Return the complete note content.`;
				break;
			case "append":
				prompt += `\n\nThe user wants to append to the note "${slashCmd.target}". Return only the new content to append.`;
				break;
		}
	} else if (hasActiveNote) {
		prompt +=
			"\n\nThe active note is included in context. When the user asks you to edit, rewrite, or improve the note, return ONLY the complete revised note content. Do not wrap it in markdown code blocks or add explanations.";
	}
	return prompt;
}

function generateSessionTitle(messages: ChatMessage[]): string {
	const userMsgs = messages.filter((m) => m.role === "user");
	const assistantMsgs = messages.filter((m) => m.role === "assistant");
	if (userMsgs.length === 0) return `Chat ${new Date().toLocaleDateString()}`;

	// Prefer user messages for titles — they're the actual intent
	const candidateTexts: string[] = [];

	// Try first 2 user messages
	for (const msg of userMsgs.slice(0, 2)) {
		let text = msg.content;
		// Strip context tags
		text = text.replace(/<context>[\s\S]*?<\/context>/g, "").trim();
		// Strip markdown links/images
		text = text.replace(/!?\[([^\]]*)\]\([^)]+\)/g, "$1").trim();
		// Strip code blocks
		text = text.replace(/```[\s\S]*?```/g, "").trim();
		// Strip inline code
		text = text.replace(/`([^`]+)`/g, "$1").trim();
		// Strip JSON
		text = text.replace(/\{[\s\S]*?\}/g, "").trim();
		if (text.length >= 3) candidateTexts.push(text);
	}

	// Fallback to assistant if no good user candidate
	if (candidateTexts.length === 0) {
		for (const msg of assistantMsgs.slice(0, 1)) {
			let text = msg.content.replace(/```[\s\S]*?```/g, "").trim();
			text = text.replace(/\{[\s\S]*?\}/g, "").trim();
			if (text.length >= 3) candidateTexts.push(text);
		}
	}

	if (candidateTexts.length === 0) return `Chat ${new Date().toLocaleDateString()}`;

	// Generic words that make bad titles — check AFTER stripping punctuation
	const genericWords = new Set([
		"hello", "hi", "hey", "help", "please", "thanks", "thank you",
		"ok", "okay", "sure", "yes", "no", "what", "how", "why", "when", "where", "who",
		"good morning", "good afternoon", "good evening",
	]);

	// Stop words to strip from the START of text (with optional punctuation)
	const stopWords = /^(please\s+|can\s+you\s+|could\s+you\s+|hey[.!?\s]*|hi[.!?\s]*|hello[.!?\s]*|so\s+|um\s+|uh\s+|okay\s+|ok\s+|well\s+|now\s+|then\s+)/i;

	for (let text of candidateTexts) {
		// Extract first sentence-ish chunk
		const sentenceMatch = text.match(/^([^.!?\n]{2,80}[.!?\n]?)/);
		let title = sentenceMatch ? sentenceMatch[1].trim() : text.slice(0, 80);

		// Strip leading stop words (handles "Hello." → "", "Hello " → "")
		title = title.replace(stopWords, "").trim();

		// Skip if too short after stripping
		if (title.length < 3) continue;

		// Check if remaining title is just generic words (strip punctuation for check)
		const cleanForCheck = title.replace(/[.!?,;:"'\-]+$/, "").trim().toLowerCase();
		if (genericWords.has(cleanForCheck)) continue;

		// Capitalize first letter
		title = title.charAt(0).toUpperCase() + title.slice(1);

		// Truncate at word boundary near 40 chars
		if (title.length > 45) {
			const truncated = title.slice(0, 45);
			const lastSpace = truncated.lastIndexOf(" ");
			if (lastSpace > 25) {
				title = truncated.slice(0, lastSpace) + "…";
			} else {
				title = truncated + "…";
			}
		}

		return title;
	}

	return `Chat ${new Date().toLocaleDateString()}`;
}

/** Ask the LLM to suggest a short title for the conversation.
 *  Falls back to heuristic naming on error or if LLM returns nothing useful. */
async function generateSessionTitleLLM(
	messages: ChatMessage[],
	profile: ProviderProfile,
	chatapi: ChatApiManager,
): Promise<string | null> {
	if (messages.length === 0) return null;

	// Build a minimal context: first 3 user + 3 assistant messages
	const context = messages
		.slice(0, 6)
		.map((m) => {
			let content = m.content.slice(0, 200); // cap each message
			// Strip heavy artifacts
			content = content.replace(/```[\s\S]*?```/g, "[code]");
			content = content.replace(/\{[\s\S]*?\}/g, "[data]");
			content = content.replace(/<context>[\s\S]*?<\/context>/g, "");
			return `${m.role}: ${content}`;
		})
		.join("\n");

	const system =
		"You are a helpful assistant. Given a short conversation, produce a concise, descriptive title (3–6 words). " +
		"Use the user's language. Output ONLY the title text, no quotes, no explanation.";

	const prompt = `Conversation:\n${context}\n\nTitle:`;

	try {
		const result = await chatapi.callApi(system, prompt, profile);
		let title = result.trim();
		// Strip quotes if the model added them
		title = title.replace(/^["']|["']$/g, "").trim();
		if (title.length < 2 || title.length > 60) return null;
		return title;
	} catch (e) {
		console.error("[generateSessionTitleLLM] failed, falling back", e);
		return null;
	}
}

function pruneSessions(
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

function makeId(): string {
	return crypto.randomUUID();
}

interface SlashCommand {
	command: "edit" | "create" | "append";
	target: string;
	prompt: string;
}

function parseSlashCommand(text: string): SlashCommand | null {
	const match = text.match(
		/^\/(edit|create|append)\s+(?:\[\[)?([^\]\n]+?)(?:\]\])?(?:\s+([\s\S]*))?$/i,
	);
	if (!match) return null;
	return {
		command: match[1].toLowerCase() as "edit" | "create" | "append",
		target: match[2].trim(),
		prompt: (match[3] ?? "").trim(),
	};
}

function contextItemKey(item: ContextItem): string {
	switch (item.type) {
		case "note":
			return `note:${item.path}`;
		case "folder":
			return `folder:${item.path}`;
		case "tag":
			return `tag:${item.tag}`;
		case "active-note":
		default:
			return `active:${item.id}`;
	}
}

function sameContextItems(a: ContextItem[], b: ContextItem[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((item, index) => contextItemKey(item) === contextItemKey(b[index]));
}

/** Get a consistent color for a provider type */
function getAgentColor(provider: string): string {
	switch (provider) {
		case "gemini": return "#6366f1";
		case "openai": return "#10b981";
		case "anthropic": return "#f43f5e";
		case "agent": return "#06b6d4";
		case "ollama": return "#f59e0b";
		default: return "#8b5cf6";
	}
}

/** Get a consistent icon for a provider type */
function getAgentIcon(provider: string): string {
	switch (provider) {
		case "gemini": return "💎";
		case "openai": return "🌐";
		case "anthropic": return "🧠";
		case "agent": return "☁️";
		case "ollama": return "🔥";
		default: return "🤖";
	}
}

const ChatApp: React.FC<ChatAppProps> = ({ plugin, profileId }) => {
	const [sessions, setSessions] = useState<ChatSession[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [currentAiMessage, setCurrentAiMessage] = useState("");
	const [currentContentParts, setCurrentContentParts] = useState<ContentPart[]>([]);
	const [contextItems, setContextItems] = useState<ContextItem[]>([]);
	const [wasTruncated, setWasTruncated] = useState(false);
	const [contextTokenCount, setContextTokenCount] = useState(0);
	const [targetNoteName, setTargetNoteName] = useState<string | null>(null);
	const [showSessionPicker, setShowSessionPicker] = useState(false);
	const [showExportModal, setShowExportModal] = useState(false);
	const [showContextPicker, setShowContextPicker] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	// ─── Multi-select Toolbar ───
	const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set());
	const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
	const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
	const participantDropdownRef = useRef<HTMLDivElement>(null);

	// Close participant dropdown when clicking outside
	useEffect(() => {
		if (!showParticipantDropdown) return;
		const handleClick = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				participantDropdownRef.current &&
				!participantDropdownRef.current.contains(target)
			) {
				setShowParticipantDropdown(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [showParticipantDropdown]);

	// ─── Zen Mode ───
	const [zenMode, setZenMode] = useState(false);
	const [debateMode, setDebateMode] = useState(false);
	const [originalMessages, setOriginalMessages] = useState<ChatMessage[]>([]);
	const [editMessageText, setEditMessageText] = useState<string>("");
	const [pendingToolCall, setPendingToolCall] = useState<ToolCall | null>(
		null,
	);
	const [chatDataLoaded, setChatDataLoaded] = useState(false);
	const controllerRef = useRef<AbortController | null>(null);
	const saveTimerRef = useRef<number | null>(null);
	const skipNextAutosaveRef = useRef(false);
	const resolveToolRef = useRef<((result: ToolResult | null) => void) | null>(
		null,
	);
	// Refs so callbacks always see latest values without stale closures
	const messagesRef = useRef<ChatMessage[]>([]);
	const contextItemsRef = useRef<ContextItem[]>([]);
	const sessionsRef = useRef<ChatSession[]>([]);
	contextItemsRef.current = contextItems;
	sessionsRef.current = sessions;
	const activeSessionIdRef = useRef<string | null>(null);
	activeSessionIdRef.current = activeSessionId;
	// Tracks the last focused markdown leaf
	const lastMarkdownLeafRef = useRef<WorkspaceLeaf | null>(null);
	// Track which sessions have been LLM-named to avoid re-calling
	const llmNamedRef = useRef<Set<string>>(new Set());

	// Force re-render when user returns to chat tab (settings may have changed)
	const [settingsTick, setSettingsTick] = useState(0);
	useEffect(() => {
		const onVis = () => { if (!document.hidden) setSettingsTick(t => t + 1); };
		document.addEventListener("visibilitychange", onVis);
		return () => document.removeEventListener("visibilitychange", onVis);
	}, []);

	/** Resolve the profile for this chat panel: explicit profileId → session's stored profile → active profile */
	const resolvedProfile: ProviderProfile = useMemo(() => {
		if (profileId) {
			const p = plugin.settings.providerProfiles.find((pr) => pr.id === profileId);
			if (p) return p;
		}
		// If a session is active and has a stored profileId, use it
		const activeSession = sessions.find((s) => s.id === activeSessionId);
		if (activeSession?.profileId) {
			const p = plugin.settings.providerProfiles.find((pr) => pr.id === activeSession.profileId);
			if (p) return p;
		}
		return getActiveProviderProfile(plugin.settings);
	}, [profileId, activeSessionId, plugin.settings.providerProfiles, sessions, settingsTick]);

	// ─── Derive participants from selectedProfileIds (auto group chat when 2+ selected) ───
	const participants = useMemo(() => {
		const ids = Array.from(selectedProfileIds);
		if (ids.length < 2) return [];
		return ids.map((id) => {
			const profile = plugin.settings.providerProfiles.find((p) => p.id === id);
			return {
				id,
				name: profile?.name ?? "Unknown",
				profileId: id,
				color: getAgentColor(profile?.provider ?? "custom"),
				icon: getAgentIcon(profile?.provider ?? "custom"),
			};
		});
	}, [selectedProfileIds, plugin.settings.providerProfiles]);

	const isGroupChat = participants.length >= 2;

	// ─── Group Chat Orchestrator ───
	const orchestrator = useMemo(() => {
		if (!isGroupChat || participants.length === 0) return null;
		const resolved = participants.map((p) => {
			const profile = plugin.settings.providerProfiles.find((pr) => pr.id === p.profileId);
			return { ...p, profile: profile ?? undefined };
		});
		const orch = new Orchestrator({
			api: plugin.chatapi,
			participants: resolved.map((e) => ({
				id: e.id,
				name: e.name,
				profileId: e.profileId,
				color: e.color,
				icon: e.icon,
			})),
			mode: "sequential",
			contextStrategy: "full",
			enableTools: plugin.settings.enableAgentTools,
			autoApprove: plugin.settings.autoApply,
			maxSteps: plugin.settings.maxAgentSteps,
			toolExecutor: new ToolExecutor(plugin.app, plugin.settings),
		});
		// Override engine profiles
		orch.engines = resolved.map((e) => ({
			id: e.id,
			name: e.name,
			color: e.color,
			profile: e.profile ?? {
				id: e.profileId,
				name: e.name,
				provider: "custom",
				model: "default",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			} as ProviderProfile,
		}));
		return orch;
	}, [isGroupChat, participants, plugin.chatapi, plugin.settings, plugin.app]);

	// ─── Multi-select Toolbar Handlers ───
	const handleToggleProfile = useCallback((profile: ProviderProfile) => {
		setSelectedProfileIds((prev) => {
			const next = new Set(prev);
			if (next.has(profile.id)) {
				next.delete(profile.id);
			} else {
				next.add(profile.id);
			}
			return next;
		});
	}, []);

	const handleToggleDebateMode = useCallback(() => {
		setDebateMode((d) => !d);
	}, []);

	const messages = useMemo(() => {
		const s = sessions.find((s) => s.id === activeSessionId);
		return s?.messages ?? [];
	}, [sessions, activeSessionId]);
	messagesRef.current = messages;

	// Sync contextItems when active session changes (NOT when sessions data mutates)
	const prevActiveSessionIdRef = useRef<string | null>(null);
	useEffect(() => {
		console.log(`[Effect1] fired — activeSessionId=${activeSessionId}, prev=${prevActiveSessionIdRef.current}`);
		if (activeSessionId === prevActiveSessionIdRef.current) {
			console.log(`[Effect1] SKIPPED — activeSessionId unchanged`);
			return; // activeSessionId didn't change — don't sync from session
		}
		prevActiveSessionIdRef.current = activeSessionId;
		const s = sessionsRef.current.find((s) => s.id === activeSessionId);
		const sessionItems = s?.contextItems ?? [];
		const needsUpdate = !sameContextItems(contextItemsRef.current, sessionItems);
		console.log(`[Effect1] activeSessionId CHANGED — sessionItems=${JSON.stringify(sessionItems.map(contextItemKey))}, current=${JSON.stringify(contextItemsRef.current.map(contextItemKey))}, needsUpdate=${needsUpdate}`);
		if (needsUpdate) {
			console.log(`[Effect1] calling setContextItems`);
			setContextItems(sessionItems);
		}
		setWasTruncated(false);
	}, [activeSessionId]);

	// Persist contextItems to the current session whenever they change
	useEffect(() => {
		const currentActiveId = activeSessionIdRef.current;
		console.log(`[Effect2] fired — contextItems changed, activeId=${currentActiveId}, items=${JSON.stringify(contextItems.map(contextItemKey))}`);
		if (!currentActiveId) {
			console.log(`[Effect2] SKIPPED — no active session`);
			return;
		}
		setSessions((prev) => {
			const s = prev.find((s) => s.id === currentActiveId);
			const same = s ? sameContextItems(s.contextItems, contextItems) : false;
			console.log(`[Effect2] setSessions updater — sameContextItems=${same}, sessionItems=${JSON.stringify(s?.contextItems.map(contextItemKey))}`);
			if (same) {
				console.log(`[Effect2] returning same session (no change)`);
				return prev;
			}
			const updated = prev.map((s) => {
				if (s.id !== currentActiveId) return s;
				return { ...s, contextItems };
			});
			console.log(`[Effect2] returning updated sessions`);
			return updated;
		});
		setWasTruncated(false);
	}, [contextItems]);

	// Initialise leaf tracking and register workspace listener
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

	// Load persisted sessions on mount
	useEffect(() => {
		let cancelled = false;
		plugin.loadChatData().then((data) => {
			if (cancelled) return;
			if (data.sessions.length > 0 || data.activeSessionId) {
				skipNextAutosaveRef.current = true;
				setSessions(data.sessions);
				setActiveSessionId(data.activeSessionId);
				// Restore selected profile IDs from the active session
				const activeSession = data.sessions.find((s) => s.id === data.activeSessionId);
				if (activeSession?.selectedProfileIds && activeSession.selectedProfileIds.length > 0) {
					setSelectedProfileIds(new Set(activeSession.selectedProfileIds));
				} else if (plugin.settings.selectedProfileIds.length > 0) {
					setSelectedProfileIds(new Set(plugin.settings.selectedProfileIds));
				}
				// Restore legacy participants if present (backward compat)
				if (activeSession?.participants && activeSession.participants.length > 0) {
					const ids = activeSession.participants.map((p) => p.id);
					setSelectedProfileIds(new Set(ids));
				}
			} else {
				// Default to the active provider profile for new chats
				const activeProfile = getActiveProviderProfile(plugin.settings);
				const defaultSelectedIds = plugin.settings.selectedProfileIds?.length > 0
					? plugin.settings.selectedProfileIds
					: [activeProfile.id];

				const newSession: ChatSession = {
					id: makeId(),
					title: "",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messages: [],
					contextItems: plugin.settings.includeActiveNote
						? [{ type: "active-note", id: makeId() }]
						: [],
					profileId: profileId || activeProfile.id,
					selectedProfileIds: defaultSelectedIds,
				};
				setSessions([newSession]);
				setActiveSessionId(newSession.id);
				setSelectedProfileIds(new Set(defaultSelectedIds));
			}
			setChatDataLoaded(true);
		});
		return () => {
			cancelled = true;
		};
	}, [plugin]);

	// Sync selectedProfileIds into the active session whenever they change
	useEffect(() => {
		if (!activeSessionId) return;
		const ids = Array.from(selectedProfileIds);
		setSessions((prev) =>
			prev.map((s) =>
				s.id === activeSessionId
					? {
						...s,
						selectedProfileIds: ids,
						isGroupChat: ids.length >= 2,
						participants: ids.length >= 2
							? ids.map((id) => {
									const profile = plugin.settings.providerProfiles.find((p) => p.id === id);
									return {
										id,
										name: profile?.name ?? "Unknown",
										profileId: id,
										color: getAgentColor(profile?.provider ?? "custom"),
										icon: getAgentIcon(profile?.provider ?? "custom"),
									};
								})
							: [],
					}
					: s,
			),
		);
	}, [selectedProfileIds, activeSessionId, plugin.settings.providerProfiles]);

	// Persist sessions whenever they change, but coalesce bursty updates
	useEffect(() => {
		if (!chatDataLoaded) return;
		if (skipNextAutosaveRef.current) {
			skipNextAutosaveRef.current = false;
			return;
		}
		if (sessions.length > 0) {
			if (saveTimerRef.current) {
				window.clearTimeout(saveTimerRef.current);
			}
			saveTimerRef.current = window.setTimeout(() => {
				void plugin.saveChatData({ sessions, activeSessionId });
				saveTimerRef.current = null;
			}, 150);
		}
		return () => {
			if (saveTimerRef.current) {
				window.clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}
		};
	}, [sessions, activeSessionId, plugin, chatDataLoaded]);

	const [autoApprove, setAutoApprove] = useState(plugin.settings.autoApply);
	const [autoNameSessions, setAutoNameSessions] = useState(plugin.settings.autoNameSessions);

	// Auto-title session after it has a few messages
	useEffect(() => {
		if (!autoNameSessions) return;
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		if (llmNamedRef.current.has(currentActiveId)) return; // already named
		const session = sessionsRef.current.find(
			(s) => s.id === currentActiveId,
		);
		if (!session || session.title) return;
		const userMsgs = session.messages.filter((m) => m.role === "user");
		const assistantMsgs = session.messages.filter((m) => m.role === "assistant");
		if (userMsgs.length >= 1 && assistantMsgs.length >= 2) {
			llmNamedRef.current.add(currentActiveId);
			// Try LLM naming first, then fall back to heuristic
			void (async () => {
				const title = await generateSessionTitleLLM(
					session.messages.slice(0, 6),
					resolvedProfile,
					plugin.chatapi,
				);
				if (title) {
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId ? { ...s, title } : s,
						),
					);
				} else {
					// LLM failed — use heuristic
					const fallback = generateSessionTitle(session.messages);
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId ? { ...s, title: fallback } : s,
						),
					);
				}
			})();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessions, activeSessionId, autoNameSessions]);

	const handleToggleActiveNote = useCallback(() => {
		console.log(`[handleToggleActiveNote] fired — current items=${JSON.stringify(contextItemsRef.current.map(contextItemKey))}`);
		setContextItems((prev) => {
			const hasActive = prev.some((i) => i.type === "active-note");
			console.log(`[handleToggleActiveNote] hasActive=${hasActive}, prevItems=${JSON.stringify(prev.map(contextItemKey))}`);
			if (hasActive) {
				return prev.filter((i) => i.type !== "active-note");
			}
			return [...prev, { type: "active-note", id: makeId() }];
		});
	}, []);

	const handleRemoveContextItem = useCallback((id: string) => {
		setContextItems((prev) => prev.filter((i) => i.id !== id));
	}, []);

	const handleAddMention = useCallback((item: ContextItem) => {
		handleAddContextItems([item]);
	}, []);

	const handleAddContextItems = useCallback((items: ContextItem[]) => {
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
		setShowContextPicker(false);
	}, []);

	const handleSend = useCallback(
		async (text: string) => {
			if (!text.trim() || isStreaming) return;

			// ═══════════════════════════════════════════════════════
			// GROUP CHAT PATH
			// ═══════════════════════════════════════════════════════
			if (isGroupChat && orchestrator) {
				const userMsg: ChatMessage = {
					id: makeId(),
					role: "user",
					content: text,
					timestamp: Date.now(),
				};
				const currentActiveId = activeSessionIdRef.current;
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId
							? { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() }
							: s,
					),
				);
				setIsStreaming(true);
				controllerRef.current = new AbortController();

				const { targets } = orchestrator.parseAndRoute(text);
				setTypingAgents(new Set(targets.map((t) => t.name)));

				try {
					const stream = debateMode
						? orchestrator.debate(
								text,
								sessionsRef.current.find((s) => s.id === currentActiveId)?.messages ?? [],
								controllerRef.current?.signal,
								2,
						  )
						: orchestrator.dispatch(
								text,
								sessionsRef.current.find((s) => s.id === currentActiveId)?.messages ?? [],
								controllerRef.current?.signal,
						  );

					for await (const response of stream) {
						setTypingAgents((prev) => {
							const next = new Set(prev);
							next.delete(response.agentName);
							return next;
						});

						const assistantMsg: ChatMessage = {
							id: makeId(),
							role: "assistant",
							content: response.error
								? `⚠️ ${response.agentName} failed: ${response.error}`
								: response.text,
							timestamp: Date.now(),
							agentId: response.agentId,
							agentName: response.agentName,
							agentColor: response.agentColor,
							isError: !!response.error,
							toolCalls: response.toolCalls,
							estimatedTokens: response.tokenEstimate,
						};

						setSessions((prev) =>
							prev.map((s) =>
								s.id === currentActiveId
									? { ...s, messages: [...s.messages, assistantMsg], updatedAt: Date.now() }
									: s,
							),
						);
					}
				} catch (error: any) {
					new Notice(`❌ Group chat error: ${error.message}`);
					const errorMsg: ChatMessage = {
						id: makeId(),
						role: "assistant",
						content: `⚠️ Council error: ${error.message}`,
						timestamp: Date.now(),
						isError: true,
					};
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? { ...s, messages: [...s.messages, errorMsg], updatedAt: Date.now() }
								: s,
						),
					);
				} finally {
					setIsStreaming(false);
					setTypingAgents(new Set());
					controllerRef.current = null;
				}
				return;
			}

			// Parse slash commands
			const slashCmd = parseSlashCommand(text);
			let sendText = text;
			let sendContextItems = contextItemsRef.current;
			let commandMeta: ChatMessage["command"] = undefined;

			if (slashCmd) {
				commandMeta = {
					type: slashCmd.command,
					target: slashCmd.target,
				};
				sendText =
					slashCmd.prompt ||
					`Please ${slashCmd.command} ${slashCmd.target}`;

				if (
					slashCmd.command === "edit" ||
					slashCmd.command === "append"
				) {
					// Resolve target note and add to context
					const file = plugin.app.metadataCache.getFirstLinkpathDest(
						slashCmd.target,
						"",
					);
					if (file && file instanceof TFile) {
						const exists = sendContextItems.some(
							(i) => i.type === "note" && i.path === file.path,
						);
						if (!exists) {
							sendContextItems = [
								...sendContextItems,
								{
									type: "note",
									path: file.path,
									name: file.basename,
									id: makeId(),
								},
							];
						}
					}
				}
			}

			const resolved = await resolveContextItems(
				sendContextItems,
				plugin.app,
				plugin.settings.maxContextTokens || 8000,
			);
			setWasTruncated(resolved.wasTruncated);
			setContextTokenCount(resolved.stats.estimatedTokens);

			const userTokenEstimate = estimateTokens(
				(resolved.contextString
					? resolved.contextString + "\n\n"
					: "") + sendText,
			);

			const userMsg: ChatMessage = {
				id: makeId(),
				role: "user",
				content: text,
				timestamp: Date.now(),
				contextItems: sendContextItems,
				estimatedTokens: userTokenEstimate,
			};

			const currentActiveId = activeSessionIdRef.current;
			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId
						? {
								...s,
								messages: [...s.messages, userMsg],
								updatedAt: Date.now(),
								contextItems: sendContextItems,
							}
						: s,
				),
			);
			setIsStreaming(true);
			setCurrentAiMessage("");
			setCurrentContentParts([]);
			controllerRef.current = new AbortController();
			const streamStartTime = Date.now();

			const maxContextMessages = plugin.settings.maxContextMessages || 10;
			const history = messagesRef.current
				.slice(-maxContextMessages)
				.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				}));

			let userContent = sendText;
			if (resolved.contextString) {
				userContent = `${resolved.contextString}\n\n${sendText}`;
			}

			// When exactly 1 profile is selected in the dropdown, use it instead of
			// the settings default (resolvedProfile).  2+ selections are handled by
			// the group-chat path above; 0 selections fall back to resolvedProfile.
			const selectedIds = Array.from(selectedProfileIds);
			const activeProfile: ProviderProfile =
				selectedIds.length === 1
					? (plugin.settings.providerProfiles.find(
							(p) => p.id === selectedIds[0],
						) ?? resolvedProfile)
					: resolvedProfile;
			const isAgentProvider = activeProfile.provider === "agent";
			const useTools = plugin.settings.enableAgentTools || isAgentProvider;
			const autoApprove = plugin.settings.autoApply;
			const maxAgentSteps = plugin.settings.maxAgentSteps;

			const chatMessages = [
				{
					role: "system" as const,
					content: buildSystemPrompt(
						sendContextItems,
						slashCmd ?? undefined,
						useTools && !slashCmd,
					),
				},
				...history,
				{ role: "user" as const, content: userContent },
			];

			let fullText = "";
			let toolCallsLog: Array<{ call: ToolCall; result?: ToolResult }> = [];
			// Ordered content parts for inline tool call rendering
			let contentParts: Array<import("../types").ContentPart> = [];
			// Tracks how much of fullText has been consumed into contentParts
			let textCheckpoint = 0;
			try {
			let assistantContent = fullText;
			let assistantTokenEstimate = 0;

			if (isAgentProvider) {
				console.log(
					`[ChatApp] OpenResponsesLoop start — ${chatMessages.length} msgs`,
				);
				if (!activeProfile.endpointUrl) {
					throw new Error("Agent endpoint URL is not configured.");
				}
				const agentApi = new AgentApiManager(
					{
						id: activeProfile.id,
						name: activeProfile.name,
						provider: "agent",
						model: activeProfile.model,
						endpointUrl: activeProfile.endpointUrl,
						agentId: activeProfile.agentId || "main",
						authToken: activeProfile.apiKey,
						sessionKey: activeProfile.sessionKey,
						autoApprove: activeProfile.autoApprove ?? autoApprove,
						maxSteps: activeProfile.maxSteps ?? maxAgentSteps,
					},
					plugin.app,
				);
				const openResponsesLoop = new OpenResponsesLoop({
					agentApi,
					toolExecutor: new ToolExecutor(plugin.app, plugin.settings),
					maxSteps: activeProfile.maxSteps ?? maxAgentSteps,
					autoApprove: activeProfile.autoApprove ?? autoApprove,
					onTextDelta: (text) => {
						fullText = text;
						setCurrentAiMessage(stripThinkingTags(text));
					},
					onToolCall: (call) => {
						console.log(
							`[ChatApp] OR-tool-call pending: ${call.toolName}`,
							call.args,
						);
						const pendingText = stripThinkingTags(
							fullText.slice(textCheckpoint)
						);
						if (pendingText) {
							contentParts.push({ type: "text", content: pendingText });
						}
						toolCallsLog.push({ call });
						contentParts.push({ type: "tool_call", call });
						setCurrentContentParts([...contentParts]);
						textCheckpoint = fullText.length;
					},
					requestApproval: async (call) => {
						setPendingToolCall(call);
						const resolved = await new Promise<
							ToolResult | null
						>((resolve) => {
							resolveToolRef.current = resolve;
						});
						setPendingToolCall(null);
						const lastIdx = toolCallsLog.length - 1;
						if (lastIdx >= 0) {
							toolCallsLog[lastIdx] = {
								...toolCallsLog[lastIdx],
								result: resolved || undefined,
							};
						}
						const partIdx = contentParts.findIndex(
							(p) => p.type === "tool_call" && p.call.toolCallId === call.toolCallId
						);
						if (partIdx >= 0 && resolved) {
							const part = contentParts[partIdx];
							if (part.type === "tool_call") {
								contentParts[partIdx] = { ...part, result: resolved };
							}
						}
						return resolved;
					},
					onToolResult: (call, result) => {
						console.log(
							`[ChatApp] OR-tool-result: ${call.toolName}`,
							result.error ?? "success",
						);
						const idx = toolCallsLog.findIndex(
							(tc) => tc.call.toolCallId === call.toolCallId,
						);
						if (idx >= 0) {
							toolCallsLog[idx] = {
								...toolCallsLog[idx],
								result,
							};
						}
						const partIdx = contentParts.findIndex(
							(p) => p.type === "tool_call" && p.call.toolCallId === call.toolCallId
						);
						if (partIdx >= 0) {
							const part = contentParts[partIdx];
							if (part.type === "tool_call") {
								contentParts[partIdx] = { ...part, result };
							}
						}
					},
				});

				const orTools = noteToolsToOpenResponses(noteTools);
				const resultText = await openResponsesLoop.run(
					chatMessages as Array<{ role: "user" | "assistant" | "system"; content: string }>,
					orTools,
					controllerRef.current.signal,
				);
				assistantContent = resultText;
				assistantTokenEstimate = estimateTokens(resultText);
				console.log(
					`[ChatApp] OpenResponsesLoop done — ${resultText.length} chars`,
				);
			} else if (useTools && !slashCmd) {
					console.log(
						`[ChatApp] AgentLoop start — ${chatMessages.length} msgs`,
					);
					const agent = new AgentLoop({
						chatApi: plugin.chatapi,
						toolExecutor: new ToolExecutor(plugin.app, plugin.settings),
						maxSteps: maxAgentSteps,
						autoApprove,
						profile: resolvedProfile,
						onTextDelta: (text) => {
							fullText = text;
							// Strip thinking tags from streaming display
							setCurrentAiMessage(stripThinkingTags(text));
						},
						onToolCall: (call) => {
							console.log(
								`[ChatApp] tool-call pending: ${call.toolName}`,
								call.args,
							);
							// Capture text accumulated since last checkpoint, stripping thinking tags
							const pendingText = stripThinkingTags(
								fullText.slice(textCheckpoint)
							);
							if (pendingText) {
								contentParts.push({ type: "text", content: pendingText });
							}
							// Add tool call to parts and log
							toolCallsLog.push({ call });
							contentParts.push({ type: "tool_call", call });
							// Update live streaming state
							setCurrentContentParts([...contentParts]);
							// Advance checkpoint to current position
							textCheckpoint = fullText.length;
						},
						requestApproval: async (call) => {
							setPendingToolCall(call);
							const resolved = await new Promise<
								ToolResult | null
							>((resolve) => {
								resolveToolRef.current = resolve;
							});
							setPendingToolCall(null);
							// Update the last pending tool call with the result
							const lastIdx = toolCallsLog.length - 1;
							if (lastIdx >= 0) {
								toolCallsLog[lastIdx] = {
									...toolCallsLog[lastIdx],
									result: resolved || undefined,
								};
							}
							// Update the matching content part with result
							const partIdx = contentParts.findIndex(
								(p) => p.type === "tool_call" && p.call.toolCallId === call.toolCallId
							);
							if (partIdx >= 0 && resolved) {
								const part = contentParts[partIdx];
								if (part.type === "tool_call") {
									contentParts[partIdx] = { ...part, result: resolved };
								}
							}
							return resolved;
						},
						onToolResult: (call, result) => {
							console.log(
								`[ChatApp] tool-result: ${call.toolName}`,
								result.error ?? "success",
							);
							// Update the matching tool call with the result
							const idx = toolCallsLog.findIndex(
								(tc) => tc.call.toolCallId === call.toolCallId,
							);
							if (idx >= 0) {
								toolCallsLog[idx] = {
									...toolCallsLog[idx],
									result,
								};
							}
							// Update the matching content part with result
							const partIdx = contentParts.findIndex(
								(p) => p.type === "tool_call" && p.call.toolCallId === call.toolCallId
							);
							if (partIdx >= 0) {
								const part = contentParts[partIdx];
								if (part.type === "tool_call") {
									contentParts[partIdx] = { ...part, result };
								}
							}
						},
					});

					const result = await agent.run(
						chatMessages as Array<any>,
						noteTools,
						controllerRef.current.signal,
					);
					assistantContent = result.text;
					assistantTokenEstimate = result.tokenEstimate;
					console.log(
						`[ChatApp] AgentLoop done — ${result.text.length} chars`,
					);
				} else {
					console.log(
						`[ChatApp] streamChat start — ${chatMessages.length} msgs`,
					);
					for await (const chunk of plugin.chatapi.streamChat(
						chatMessages,
						controllerRef.current.signal,
						resolvedProfile,
					)) {
						fullText += chunk;
						// Only show streaming content for non-slash commands
						if (!slashCmd) {
							setCurrentAiMessage(stripThinkingTags(fullText));
						}
					}
					console.log(
						`[ChatApp] streamChat done — ${fullText.length} chars`,
					);
					assistantContent = fullText;
					assistantTokenEstimate = estimateTokens(fullText);
					// Non-tool path: single text part (strip thinking tags)
					contentParts = [{ type: "text", content: stripThinkingTags(fullText) }];
				}

				// For slash commands, execute the action and show a status message
				if (slashCmd?.command === "create" && fullText) {
					const fileName = slashCmd.target.endsWith(".md")
						? slashCmd.target
						: `${slashCmd.target}.md`;
					try {
						await plugin.app.vault.create(fileName, fullText);
						new Notice(`✓ Created note: ${slashCmd.target}`);
						assistantContent = `✓ Created note: ${slashCmd.target}`;
					} catch (e: any) {
						new Notice(`⚠️ Could not create note: ${e.message}`);
						assistantContent = `⚠️ Could not create note: ${e.message}`;
					}
					assistantTokenEstimate = estimateTokens(assistantContent);
				} else if (slashCmd?.command === "edit" && fullText) {
					const success = await NoteEditingBridge.applyToTargetNote(
						plugin.app,
						slashCmd.target,
						fullText,
						"Apply AI edit",
					);
					assistantContent = success
						? `✓ Applied edits to ${slashCmd.target}`
						: `⚠️ Could not apply edits to ${slashCmd.target}`;
					assistantTokenEstimate = estimateTokens(assistantContent);
				} else if (slashCmd?.command === "append" && fullText) {
					let file = plugin.app.vault.getAbstractFileByPath(
						slashCmd.target,
					);
					if (!file || !(file instanceof TFile)) {
						const resolved =
							plugin.app.metadataCache.getFirstLinkpathDest(
								slashCmd.target,
								"",
							);
						if (resolved && resolved instanceof TFile) {
							file = resolved;
						}
					}
					if (file && file instanceof TFile) {
						await NoteEditingBridge.appendToNote(
							plugin.app,
							file,
							fullText,
						);
						assistantContent = `✓ Appended to ${slashCmd.target}`;
					} else {
						assistantContent = `⚠️ Note not found: ${slashCmd.target}`;
					}
					assistantTokenEstimate = estimateTokens(assistantContent);
				}

				// Finalize any remaining text after all tool calls / streaming
				if (useTools && !slashCmd) {
					const remainingText = stripThinkingTags(
						fullText.slice(textCheckpoint)
					);
					if (remainingText) {
						contentParts.push({ type: "text", content: remainingText });
					}
				}

				// Build the assistant message with cleaned content
				const cleanAssistantContent = stripThinkingTags(assistantContent);
				const assistantMsg: ChatMessage = {
					id: makeId(),
					role: "assistant",
					content: cleanAssistantContent,
					timestamp: Date.now(),
					command: commandMeta,
					estimatedTokens: assistantTokenEstimate,
					modelName: activeProfile.model,
					responseTimeMs: Date.now() - streamStartTime,
					toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
					contentParts: contentParts.length > 0 ? contentParts : undefined,
				};
				console.log(
					`[ChatApp] adding assistantMsg — ${assistantContent.length} chars, id=${assistantMsg.id}`,
				);
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId
							? {
									...s,
									messages: [...s.messages, assistantMsg],
									updatedAt: Date.now(),
									contextItems: sendContextItems,
								}
							: s,
					),
				);
			} catch (e: any) {
				if (e.name === "AbortError") {
					console.log(
						`[ChatApp] streamChat aborted — partial ${fullText.length} chars`,
					);
					if (fullText) {
						// Build content parts for aborted message
						let abortedParts: Array<import("../types").ContentPart> = [];
						if (useTools && !slashCmd) {
							abortedParts = [...contentParts];
							const remainingText = stripThinkingTags(
								fullText.slice(textCheckpoint)
							);
							if (remainingText) {
								abortedParts.push({ type: "text", content: remainingText + " [stopped]" });
							}
						} else {
							abortedParts = [{ type: "text", content: stripThinkingTags(fullText) + " [stopped]" }];
						}
						const stoppedMsg: ChatMessage = {
							id: makeId(),
							role: "assistant",
							content: stripThinkingTags(fullText) + " [stopped]",
							timestamp: Date.now(),
							command: commandMeta,
							estimatedTokens: estimateTokens(fullText),
							modelName: activeProfile.model,
							responseTimeMs: Date.now() - streamStartTime,
							contentParts: abortedParts,
						};
						setSessions((prev) =>
							prev.map((s) =>
								s.id === currentActiveId
									? {
											...s,
											messages: [
												...s.messages,
												stoppedMsg,
											],
											updatedAt: Date.now(),
											contextItems: sendContextItems,
										}
									: s,
							),
						);
					}
				} else {
					console.error("[ChatApp] streamChat error:", e.message);
					const errorMsg: ChatMessage = {
						id: makeId(),
						role: "assistant",
						content: `Error: ${e.message}`,
						timestamp: Date.now(),
						isError: true,
						command: commandMeta,
						estimatedTokens: estimateTokens(`Error: ${e.message}`),
					};
					setSessions((prev) =>
						prev.map((s) =>
							s.id === currentActiveId
								? {
										...s,
										messages: [...s.messages, errorMsg],
										updatedAt: Date.now(),
										contextItems: sendContextItems,
									}
								: s,
						),
					);
				}
			} finally {
				console.log("[ChatApp] finally block — resetting stream state");
				setIsStreaming(false);
				setCurrentAiMessage("");
				setCurrentContentParts([]);
				controllerRef.current = null;
				setIsEditing(false);
				setOriginalMessages([]);
				setEditMessageText("");
				// Clear context items after send (context is per-message)
				setContextItems([]);
			}
		},
		[isStreaming, plugin, orchestrator, isGroupChat, participants, typingAgents, debateMode, resolvedProfile],
	);

	const handleStop = useCallback(() => {
		controllerRef.current?.abort();
	}, []);

	const handleNewChat = useCallback(() => {
		if (isStreaming) controllerRef.current?.abort();

		const currentActiveId = activeSessionIdRef.current;
		const activeProfile = getActiveProviderProfile(plugin.settings);
		const defaultSelectedIds = plugin.settings.selectedProfileIds?.length > 0
			? plugin.settings.selectedProfileIds
			: [activeProfile.id];

		const newSession: ChatSession = {
			id: makeId(),
			title: "",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			messages: [],
			contextItems: plugin.settings.includeActiveNote
				? [{ type: "active-note", id: makeId() }]
				: [],
			profileId: profileId || activeProfile.id,
			selectedProfileIds: defaultSelectedIds,
		};

		setSessions((prev) => {
			const currentSession = prev.find((s) => s.id === currentActiveId);
			// If current session is empty, just keep it instead of creating another empty one
			if (currentSession && currentSession.messages.length === 0) {
				return prev.map((s) =>
					s.id === currentActiveId
						? { ...s, updatedAt: Date.now() }
						: s,
				);
			}
			const updated = prev.map((s) =>
				s.id === currentActiveId
					? {
							...s,
							title: plugin.settings.autoNameSessions
								? s.title || generateSessionTitle(s.messages)
								: s.title,
							updatedAt: Date.now(),
						}
					: s,
			);
			const withNew = [...updated, newSession];
			const max = plugin.settings.maxSavedConversations || 20;
			return pruneSessions(withNew, max, newSession.id);
		});
		setActiveSessionId(newSession.id);
		// Select the default profile(s) for the new chat
		setSelectedProfileIds(new Set(defaultSelectedIds));
		setDebateMode(false);
		setWasTruncated(false);
	}, [isStreaming, plugin]);

	const handleAppend = useCallback(
		async (content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			const file =
				leaf?.view instanceof MarkdownView
					? (leaf.view as MarkdownView).file
					: null;
			if (!(file instanceof TFile)) {
				new Notice("⚠️ No active note to append to.");
				return;
			}
			await NoteEditingBridge.appendToNote(plugin.app, file, content);
		},
		[plugin],
	);

	const handleInsertAtCursor = useCallback(
		(content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to insert at cursor.");
				return;
			}
			NoteEditingBridge.insertAtCursor(
				plugin.app,
				leaf.view as MarkdownView,
				content,
			);
		},
		[plugin],
	);

	const handleApply = useCallback(
		(content: string) => {
			const leaf = lastMarkdownLeafRef.current;
			if (!(leaf?.view instanceof MarkdownView)) {
				new Notice("⚠️ Open a note first to apply edits.");
				return;
			}
			const view = leaf.view as MarkdownView;
			NoteEditingBridge.applyToNote(
				plugin.app,
				view,
				content,
				"Apply AI edit",
			);
		},
		[plugin],
	);

	const handleRetry = useCallback(
		(messageId: string) => {
			if (isStreaming) return;
			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return;

			const session = sessionsRef.current.find(
				(s) => s.id === currentActiveId,
			);
			if (!session) return;

			const assistantIndex = session.messages.findIndex(
				(m) => m.id === messageId,
			);
			if (assistantIndex <= 0) return;

			// Find the preceding user message
			let userIndex = -1;
			for (let i = assistantIndex - 1; i >= 0; i--) {
				if (session.messages[i].role === "user") {
					userIndex = i;
					break;
				}
			}
			if (userIndex === -1) return;

			const userMsg = session.messages[userIndex];
			const truncated = session.messages.slice(0, userIndex);

			// Update ref so handleSend sees truncated history
			messagesRef.current = truncated;

			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId
						? { ...s, messages: truncated, updatedAt: Date.now() }
						: s,
				),
			);

			console.log(
				`[ChatApp] retry message ${messageId} — re-sending user msg`,
			);
			handleSend(userMsg.content);
		},
		[isStreaming, handleSend, orchestrator, isGroupChat, participants, debateMode],
	);

	const handleEditMessage = useCallback(
		(messageId: string) => {
			if (isStreaming) return;
			const currentActiveId = activeSessionIdRef.current;
			if (!currentActiveId) return;

			const session = sessionsRef.current.find(
				(s) => s.id === currentActiveId,
			);
			if (!session) return;

			const index = session.messages.findIndex((m) => m.id === messageId);
			if (index < 0 || session.messages[index].role !== "user") return;

			const msg = session.messages[index];
			const truncated = session.messages.slice(0, index);

			setOriginalMessages([...session.messages]);
			messagesRef.current = truncated;

			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId
						? { ...s, messages: truncated, updatedAt: Date.now() }
						: s,
				),
			);
			setIsEditing(true);
			setEditMessageText(msg.content);
			// The input value will be set via a ref callback in ChatInput
		},
		[isStreaming],
	);

	const handleCancelEdit = useCallback(() => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId || originalMessages.length === 0) return;

		setSessions((prev) =>
			prev.map((s) =>
				s.id === currentActiveId
					? {
							...s,
							messages: originalMessages,
							updatedAt: Date.now(),
						}
					: s,
			),
		);
		setIsEditing(false);
		setOriginalMessages([]);
		setEditMessageText("");
	}, [originalMessages]);

	const handleApplyToTarget = useCallback(
		async (content: string, target: string) => {
			await NoteEditingBridge.applyToTargetNote(
				plugin.app,
				target,
				content,
				"Apply AI edit",
			);
		},
		[plugin],
	);

	const handleCreateNote = useCallback(
		async (content: string, target: string) => {
			await NoteEditingBridge.createNote(
				plugin.app,
				target,
				content,
				"Create note",
			);
		},
		[plugin],
	);

	const handleAppendToTarget = useCallback(
		async (content: string, target: string) => {
			let file = plugin.app.vault.getAbstractFileByPath(target);
			if (!file || !(file instanceof TFile)) {
				const resolved = plugin.app.metadataCache.getFirstLinkpathDest(
					target,
					"",
				);
				if (resolved && resolved instanceof TFile) {
					file = resolved;
				}
			}
			if (!file || !(file instanceof TFile)) {
				new Notice(`⚠️ Note not found: ${target}`);
				return;
			}
			await NoteEditingBridge.appendToNote(plugin.app, file, content);
		},
		[plugin],
	);

	const handleLoadSession = useCallback((sessionId: string) => {
		setShowSessionPicker(false);
		// Restore selectedProfileIds for the loaded session BEFORE changing activeSessionId
		const session = sessionsRef.current.find((s) => s.id === sessionId);
		if (session?.selectedProfileIds && session.selectedProfileIds.length > 0) {
			setSelectedProfileIds(new Set(session.selectedProfileIds));
		} else if (session?.participants && session.participants.length > 0) {
			// Backward compat: derive from legacy participants
			setSelectedProfileIds(new Set(session.participants.map((p) => p.id)));
		} else {
			setSelectedProfileIds(new Set());
		}
		setDebateMode(false);
		setActiveSessionId(sessionId);
	}, []);

	const handleDeleteSession = useCallback((sessionId: string) => {
		setSessions((prev) => {
			const filtered = prev.filter((s) => s.id !== sessionId);
			// If deleting the active session, activate the most recent remaining
			if (activeSessionIdRef.current === sessionId) {
				const mostRecent = filtered.sort(
					(a, b) => b.updatedAt - a.updatedAt,
				)[0];
				if (mostRecent) {
					// Restore selectedProfileIds BEFORE changing active session
					if (mostRecent.selectedProfileIds && mostRecent.selectedProfileIds.length > 0) {
						setSelectedProfileIds(new Set(mostRecent.selectedProfileIds));
					} else if (mostRecent.participants && mostRecent.participants.length > 0) {
						setSelectedProfileIds(new Set(mostRecent.participants.map((p) => p.id)));
					} else {
						setSelectedProfileIds(new Set());
					}
					setDebateMode(false);
					setActiveSessionId(mostRecent.id);
				} else {
					// No sessions left — create a new empty one
					const empty: ChatSession = {
						id: makeId(),
						title: "",
						createdAt: Date.now(),
						updatedAt: Date.now(),
						messages: [],
						contextItems: plugin.settings.includeActiveNote
							? [{ type: "active-note", id: makeId() }]
							: [],
						profileId: profileId || undefined,
					};
					filtered.push(empty);
					setActiveSessionId(empty.id);
					setSelectedProfileIds(new Set());
				}
			}
			return filtered;
		});
	}, []);

	const handleRenameSession = useCallback(
		(sessionId: string, newTitle: string) => {
			setSessions((prev) =>
				prev.map((s) =>
					s.id === sessionId ? { ...s, title: newTitle.trim() } : s,
				),
			);
		},
		[],
	);

	const handleApproveTool = useCallback(async () => {
		if (!pendingToolCall) return;
		const toolExecutor = new ToolExecutor(plugin.app, plugin.settings);
		const result = await toolExecutor.execute(pendingToolCall);
		resolveToolRef.current?.(result);
		resolveToolRef.current = null;
	}, [pendingToolCall, plugin.app]);

	const handleRejectTool = useCallback(() => {
		resolveToolRef.current?.(null);
		resolveToolRef.current = null;
	}, []);

	const hasHistory = sessions.some((s) => s.messages.length > 0);

	const handleToggleAutoApprove = useCallback(() => {
		const newValue = !autoApprove;
		setAutoApprove(newValue);
		plugin.settings.autoApply = newValue;
		void plugin.saveSettings();
		new Notice(
			newValue
				? "🤖 Auto-approve ON — tool calls will run automatically"
				: "🔒 Manual mode — each tool call will ask for approval",
			2500,
		);
	}, [plugin, autoApprove]);

	const handleToggleAutoName = useCallback(() => {
		const newValue = !autoNameSessions;
		setAutoNameSessions(newValue);
		plugin.settings.autoNameSessions = newValue;
		void plugin.saveSettings();
		new Notice(
			newValue
				? "✨ Auto-name ON — sessions will be named automatically"
				: "✨ Auto-name OFF — sessions will not be named automatically",
			2500,
		);
	}, [plugin, autoNameSessions]);

	const handleManualRename = useCallback(async () => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		const session = sessionsRef.current.find(
			(s) => s.id === currentActiveId,
		);
		if (!session || session.messages.length === 0) {
			new Notice("No messages to generate a title from", 2000);
			return;
		}
		new Notice("🪄 Asking model for a title…", 1500);
		const title = await generateSessionTitleLLM(
			session.messages,
			resolvedProfile,
			plugin.chatapi,
		);
		if (title) {
			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId ? { ...s, title } : s,
				),
			);
			new Notice(`Session renamed to: "${title}"`, 2500);
		} else {
			// Fallback to heuristic
			const fallback = generateSessionTitle(session.messages);
			setSessions((prev) =>
				prev.map((s) =>
					s.id === currentActiveId ? { ...s, title: fallback } : s,
				),
			);
			new Notice(`Session renamed to: "${fallback}"`, 2500);
		}
	}, [resolvedProfile, plugin.chatapi]);

	const handleExportChat = useCallback(() => {
		setShowExportModal(true);
	}, []);

	return (
		<div className={`chat-panel${zenMode ? ' is-zen' : ''}`}>
			{!zenMode && (
				<div className="chat-action-bar-wrapper">
					<ActionBar
						onNewChat={handleNewChat}
						onLoadChat={() => setShowSessionPicker(true)}
						onExportChat={handleExportChat}
						canLoad={hasHistory}
						plugin={plugin}
						autoApprove={autoApprove}
						onToggleAutoApprove={handleToggleAutoApprove}
						autoNameSessions={autoNameSessions}
						onToggleAutoName={handleToggleAutoName}
						onManualRename={handleManualRename}
						profile={resolvedProfile}
						sessionTitle={sessions.find((s) => s.id === activeSessionId)?.title}
						zenMode={zenMode}
						onToggleZenMode={() => setZenMode((z) => !z)}
						participantCount={participants.length}
						onToggleParticipantDropdown={() => setShowParticipantDropdown((s) => !s)}
						debateMode={debateMode}
						onToggleDebateMode={() => setDebateMode((d) => !d)}
					/>
					{showParticipantDropdown && (
						<div ref={participantDropdownRef} className="chat-participant-dropdown">
							{plugin.settings.providerProfiles.map((profile) => {
								const isSelected = selectedProfileIds.has(profile.id);
								return (
									<label
										key={profile.id}
										className={`chat-participant-dropdown-item${isSelected ? " is-selected" : ""}`}
									>
										<input
											type="checkbox"
											checked={isSelected}
											onChange={() => handleToggleProfile(profile)}
										/>
										<span style={{ color: getAgentColor(profile.provider) }}>●</span>
										<span className="chat-participant-dropdown-name">{profile.name}</span>
										<span className="chat-participant-dropdown-model">{profile.model}</span>
									</label>
								);
							})}
							{plugin.settings.providerProfiles.length === 0 && (
								<div className="chat-participant-dropdown-empty">
									No profiles configured
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* Zen mode exit button (floating) */}
			{zenMode && (
				<button
					className="chat-btn chat-icon-btn chat-zen-exit"
					onClick={() => setZenMode(false)}
					title="Exit zen mode"
				>
					<ObsidianIcon icon="eye-off" size={15} />
				</button>
			)}

			<ChatMessages
				messages={messages}
				currentAiMessage={currentAiMessage}
				currentContentParts={currentContentParts}
				isStreaming={isStreaming}
				isEditing={isEditing}
				app={plugin.app}
				onAppend={handleAppend}
				onInsertAtCursor={handleInsertAtCursor}
				onApply={handleApply}
				onRetry={handleRetry}
				onEdit={handleEditMessage}
				onApplyToTarget={handleApplyToTarget}
				onCreateNote={handleCreateNote}
				onAppendToTarget={handleAppendToTarget}
			/>

			{pendingToolCall && (
				<PendingToolCard
					toolCall={pendingToolCall}
					onApprove={handleApproveTool}
					onReject={handleRejectTool}
				/>
			)}

			<ChatInput
				app={plugin.app}
				onSend={handleSend}
				onStop={handleStop}
				onAddMention={handleAddMention}
				isStreaming={isStreaming}
				isEditing={isEditing}
				onCancel={handleCancelEdit}
				editMessage={editMessageText}
				onToggleActiveNote={handleToggleActiveNote}
				hasActiveNote={contextItems.some((item) => item.type === "active-note")}
			/>
			{showSessionPicker && (
				<SessionPickerModal
					sessions={sessions}
					activeSessionId={activeSessionId}
					onLoad={handleLoadSession}
					onDelete={handleDeleteSession}
					onRename={handleRenameSession}
					onClose={() => setShowSessionPicker(false)}
				/>
			)}
			{showExportModal && (
				<ExportModal
					sessions={sessions}
					activeSessionId={activeSessionId}
					plugin={plugin}
					onClose={() => setShowExportModal(false)}
				/>
			)}
			{showContextPicker && (
				<ContextPickerModal
					app={plugin.app}
					onAdd={handleAddContextItems}
					onClose={() => setShowContextPicker(false)}
				/>
			)}
		</div>
	);
};

export default ChatApp;
