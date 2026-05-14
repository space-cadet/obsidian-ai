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
import { ChatMessage, ChatSession, ContextItem } from "../types";
import { resolveContextItems } from "../context/ContextEngine";
import { estimateTokens } from "../context/tokenEstimator";
import { noteTools } from "../agent/tools";
import { ToolExecutor } from "../agent/ToolExecutor";
import { AgentLoop } from "../agent/AgentLoop";
import type { ToolCall, ToolResult } from "../agent/types";
import ActionBar from "./ActionBar";
import ChatMessages from "./ChatMessages";
import ContextBar from "./ContextBar";
import ChatInput from "./ChatInput";
import SessionPickerModal from "./SessionPickerModal";
import ContextPickerModal from "./ContextPickerModal";

interface ChatAppProps {
	plugin: ChatPluginLike;
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
			"\n- list_notes: Browse all notes in the vault or a folder. Use sort_by=name|modified|created and limit params." +
			"\n- get_note_metadata: Get file stats (size, dates, word count) for a specific note." +
			"\n- create_folder: Create a new folder in the vault." +
			"\n- move_note: Move or rename a note to a new folder or name. Creates parent folders if needed." +
			"\n- delete_note: Delete a note from the vault." +
			"\n- list_folders: List folders in the vault. Use to understand vault structure." +
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
	const firstUser = messages.find((m) => m.role === "user");
	if (!firstUser) return `Chat ${new Date().toLocaleDateString()}`;
	const text = firstUser.content.trim();
	const clean = text.replace(/<context>[\s\S]*?<\/context>/, "").trim();
	if (clean.length === 0) return `Chat ${new Date().toLocaleDateString()}`;
	return clean.length > 40 ? clean.slice(0, 40) + "…" : clean;
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

/** Summarizes a pending tool call for the approval UI — never dumps full content */
function PendingToolCallPreview({ toolCall }: { toolCall: ToolCall }): React.ReactElement {
	const { toolName, args } = toolCall;
	const path = (args as any).path ?? (args as any).noteName ?? "—";

	const summarizeText = (text: string | undefined, maxLen = 200): { lines: number; preview: string } => {
		if (!text) return { lines: 0, preview: "" };
		const lines = text.split("\n").length;
		const preview = text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
		return { lines, preview };
	};

	if (toolName === "read_note") {
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📖 Read Note</div>
				<div className="pending-tool-meta">{path}</div>
			</div>
		);
	}

	if (toolName === "edit_note" || toolName === "create_note" || toolName === "append_to_note") {
		const content = (args as any).content ?? "";
		const { lines, preview } = summarizeText(content);
		const action = toolName === "edit_note" ? "📝 Overwrite" : toolName === "create_note" ? "➕ Create" : "⬇️ Append to";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">{action} <strong>{path}</strong></div>
				<div className="pending-tool-meta">{lines} line{lines !== 1 ? "s" : ""} · {content.length} chars</div>
				{preview && <pre className="pending-tool-preview">{preview}</pre>}
			</div>
		);
	}

	if (toolName === "patch_note") {
		const search = (args as any).search ?? "";
		const replace = (args as any).replace ?? "";
		const replaceAll = (args as any).replace_all ?? false;
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">🔧 Patch <strong>{path}</strong></div>
				<div className="pending-tool-meta">{replaceAll ? "Replace all occurrences" : "Replace first occurrence"}</div>
				<div className="pending-tool-patch-row">
					<span className="pending-tool-patch-label">Find:</span>
					<code className="pending-tool-patch-value">{search.length > 60 ? search.slice(0, 60) + "…" : search}</code>
				</div>
				<div className="pending-tool-patch-row">
					<span className="pending-tool-patch-label">Replace:</span>
					<code className="pending-tool-patch-value">{replace.length > 60 ? replace.slice(0, 60) + "…" : replace}</code>
				</div>
			</div>
		);
	}

	if (toolName === "edit_section") {
		const heading = (args as any).section_heading ?? "";
		const content = (args as any).new_content ?? "";
		const { lines, preview } = summarizeText(content);
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📋 Edit Section <strong>“{heading}”</strong> in {path}</div>
				<div className="pending-tool-meta">{lines} line{lines !== 1 ? "s" : ""} · {content.length} chars</div>
				{preview && <pre className="pending-tool-preview">{preview}</pre>}
			</div>
		);
	}

	if (toolName === "search_notes") {
		const query = (args as any).query ?? "";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">🔍 Search Notes</div>
				<div className="pending-tool-meta">Query: <code>{query}</code></div>
			</div>
		);
	}

	if (toolName === "create_folder") {
		const folderPath = (args as any).path ?? "";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📁 Create Folder</div>
				<div className="pending-tool-meta"><code>{folderPath}</code></div>
			</div>
		);
	}

	if (toolName === "move_note") {
		const from = (args as any).path ?? "";
		const to = (args as any).new_path ?? "";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📦 Move Note</div>
				<div className="pending-tool-meta">{from} → {to}</div>
			</div>
		);
	}

	if (toolName === "delete_note") {
		const notePath = (args as any).path ?? "";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">🗑️ Delete Note</div>
				<div className="pending-tool-meta"><code>{notePath}</code></div>
			</div>
		);
	}

	if (toolName === "list_folders") {
		const parent = (args as any).path ?? "(root)";
		return (
			<div className="pending-tool-summary">
				<div className="pending-tool-title">📂 List Folders</div>
				<div className="pending-tool-meta">Under: <code>{parent}</code></div>
			</div>
		);
	}

	return (
		<div className="pending-tool-summary">
			<div className="pending-tool-title">🤖 <strong>{toolName}</strong></div>
			<div className="pending-tool-meta">{path}</div>
		</div>
	);
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

const ChatApp: React.FC<ChatAppProps> = ({ plugin }) => {
	const [sessions, setSessions] = useState<ChatSession[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [currentAiMessage, setCurrentAiMessage] = useState("");
	const [contextItems, setContextItems] = useState<ContextItem[]>([]);
	const [wasTruncated, setWasTruncated] = useState(false);
	const [contextTokenCount, setContextTokenCount] = useState(0);
	const [targetNoteName, setTargetNoteName] = useState<string | null>(null);
	const [showSessionPicker, setShowSessionPicker] = useState(false);
	const [showContextPicker, setShowContextPicker] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
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

	const messages = useMemo(() => {
		const s = sessions.find((s) => s.id === activeSessionId);
		return s?.messages ?? [];
	}, [sessions, activeSessionId]);
	messagesRef.current = messages;

	// Sync contextItems when active session changes
	useEffect(() => {
		const s = sessions.find((s) => s.id === activeSessionId);
		setContextItems(s?.contextItems ?? []);
		setWasTruncated(false);
	}, [activeSessionId, sessions]);

	// Persist contextItems to the current session whenever they change
	useEffect(() => {
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		setSessions((prev) =>
			prev.map((s) => {
				if (s.id !== currentActiveId) return s;
				if (sameContextItems(s.contextItems, contextItems)) return s;
				return { ...s, contextItems };
			}),
		);
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
			} else {
				const newSession: ChatSession = {
					id: makeId(),
					title: "",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					messages: [],
					contextItems: plugin.settings.includeActiveNote
						? [{ type: "active-note", id: makeId() }]
						: [],
				};
				setSessions([newSession]);
				setActiveSessionId(newSession.id);
			}
			setChatDataLoaded(true);
		});
		return () => {
			cancelled = true;
		};
	}, [plugin]);

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

	// Auto-title session after it has a few messages
	useEffect(() => {
		if (!plugin.settings.autoNameSessions) return;
		const currentActiveId = activeSessionIdRef.current;
		if (!currentActiveId) return;
		const session = sessionsRef.current.find(
			(s) => s.id === currentActiveId,
		);
		if (!session || session.title) return;
		const userMsgs = session.messages.filter((m) => m.role === "user");
		if (userMsgs.length >= 2) {
			const title = generateSessionTitle(session.messages);
			if (title && title !== `Chat ${new Date().toLocaleDateString()}`) {
				setSessions((prev) =>
					prev.map((s) =>
						s.id === currentActiveId ? { ...s, title } : s,
					),
				);
			}
		}
	}, [sessions, activeSessionId, plugin.settings.autoNameSessions]);

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
			controllerRef.current = new AbortController();

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

			const useTools = plugin.settings.enableAgentTools;
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
			try {
				let assistantContent = fullText;
				let assistantTokenEstimate = 0;

				if (useTools && !slashCmd) {
					console.log(
						`[ChatApp] AgentLoop start — ${chatMessages.length} msgs`,
					);
					const agent = new AgentLoop({
						chatApi: plugin.chatapi,
						toolExecutor: new ToolExecutor(plugin.app),
						maxSteps: maxAgentSteps,
						autoApprove,
						onTextDelta: (text) => {
							fullText = text;
							setCurrentAiMessage(text);
						},
						onToolCall: (call) => {
							console.log(
								`[ChatApp] tool-call pending: ${call.toolName}`,
								call.args,
							);
						},
						requestApproval: async (call) => {
							setPendingToolCall(call);
							const resolved = await new Promise<
								ToolResult | null
							>((resolve) => {
								resolveToolRef.current = resolve;
							});
							setPendingToolCall(null);
							return resolved;
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
					)) {
						fullText += chunk;
						// Only show streaming content for non-slash commands
						if (!slashCmd) {
							setCurrentAiMessage(fullText);
						}
					}
					console.log(
						`[ChatApp] streamChat done — ${fullText.length} chars`,
					);
					assistantContent = fullText;
					assistantTokenEstimate = estimateTokens(fullText);
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

				const assistantMsg: ChatMessage = {
					id: makeId(),
					role: "assistant",
					content: assistantContent,
					timestamp: Date.now(),
					command: commandMeta,
					estimatedTokens: assistantTokenEstimate,
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
						const stoppedMsg: ChatMessage = {
							id: makeId(),
							role: "assistant",
							content: fullText + " [stopped]",
							timestamp: Date.now(),
							command: commandMeta,
							estimatedTokens: estimateTokens(fullText),
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
				controllerRef.current = null;
				setIsEditing(false);
				setOriginalMessages([]);
				setEditMessageText("");
				// Clear context items after send (context is per-message)
				setContextItems([]);
			}
		},
		[isStreaming, plugin],
	);

	const handleStop = useCallback(() => {
		controllerRef.current?.abort();
	}, []);

	const handleNewChat = useCallback(() => {
		if (isStreaming) controllerRef.current?.abort();

		const currentActiveId = activeSessionIdRef.current;
		const newSession: ChatSession = {
			id: makeId(),
			title: "",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			messages: [],
			contextItems: plugin.settings.includeActiveNote
				? [{ type: "active-note", id: makeId() }]
				: [],
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
		[isStreaming, handleSend],
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
		setActiveSessionId(sessionId);
		setShowSessionPicker(false);
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
					};
					filtered.push(empty);
					setActiveSessionId(empty.id);
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
		const toolExecutor = new ToolExecutor(plugin.app);
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
		const newValue = !plugin.settings.autoApply;
		plugin.settings.autoApply = newValue;
		void plugin.saveSettings();
		new Notice(
			newValue
				? "🤖 Auto-approve ON — tool calls will run automatically"
				: "🔒 Manual mode — each tool call will ask for approval",
			2500,
		);
	}, [plugin]);

	return (
		<div className="chat-panel">
			<ActionBar
				onNewChat={handleNewChat}
				onLoadChat={() => setShowSessionPicker(true)}
				canLoad={hasHistory}
				plugin={plugin}
				autoApprove={plugin.settings.autoApply}
				onToggleAutoApprove={handleToggleAutoApprove}
			/>
			<ChatMessages
				messages={messages}
				currentAiMessage={currentAiMessage}
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
			<ContextBar
				contextItems={contextItems}
				activeNoteName={targetNoteName}
				wasTruncated={wasTruncated}
				onToggleActiveNote={handleToggleActiveNote}
				estimatedTokens={contextTokenCount}
				maxTokens={plugin.settings.maxContextTokens || 8000}
			/>
			{pendingToolCall && (
				<div className="pending-tool-call">
					<PendingToolCallPreview toolCall={pendingToolCall} />
					<div className="pending-tool-actions">
						<button className="mod-cta" onClick={handleApproveTool}>
							Approve
						</button>
						<button onClick={handleRejectTool}>Reject</button>
					</div>
				</div>
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
