import React, {
	useState,
	useRef,
	useCallback,
	useEffect,
	useMemo,
} from "react";
import { Notice, App } from "obsidian";
import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { ChatMessage, ChatSession, ContextItem, GroupChatParticipant } from "../types";
import { Orchestrator, AgentResponse } from "../agent/Orchestrator";
import { parseMentions } from "../agent/MentionParser";
import { ProviderProfile } from "../settings";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import ObsidianIcon from "./ObsidianIcon";

interface GroupChatAppProps {
	plugin: ChatPluginLike;
}

const DEFAULT_PARTICIPANTS: GroupChatParticipant[] = [
	{ id: "gemini", name: "Gemini", profileId: "gemini", color: "#6366f1", icon: "💎" },
	{ id: "cloudy", name: "Cloudy", profileId: "cloudy", color: "#06b6d4", icon: "☁️" },
	{ id: "ember", name: "Ember", profileId: "ember", color: "#f59e0b", icon: "🔥" },
];

function makeId(): string {
	return crypto.randomUUID();
}

function generateGroupTitle(messages: ChatMessage[]): string {
	const firstUser = messages.find((m) => m.role === "user");
	if (!firstUser) return `Council ${new Date().toLocaleDateString()}`;
	const text = firstUser.content.trim().replace(/@\w+/g, "").trim();
	if (!text) return `Council ${new Date().toLocaleDateString()}`;
	return text.length > 40 ? text.slice(0, 40) + "…" : text;
}

const GroupChatApp: React.FC<GroupChatAppProps> = ({ plugin }) => {
	const [session, setSession] = useState<ChatSession>({
		id: makeId(),
		title: "",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		messages: [],
		contextItems: [],
		isGroupChat: true,
		participants: DEFAULT_PARTICIPANTS,
	});
	const [isStreaming, setIsStreaming] = useState(false);
	const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
	const controllerRef = useRef<AbortController | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const participants = session.participants ?? DEFAULT_PARTICIPANTS;

	// Resolve real profiles from settings
	const resolvedEngines = useMemo(() => {
		return participants.map((p) => {
			const profile = plugin.settings.providerProfiles.find(
				(pr) => pr.id === p.profileId,
			);
			return {
				...p,
				profile: profile ?? {
					id: p.profileId,
					name: p.name,
					provider: "custom",
					model: "default",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				} as ProviderProfile,
			};
		});
	}, [participants, plugin.settings.providerProfiles]);

	const orchestrator = useMemo(() => {
		return new Orchestrator({
			api: plugin.chatapi,
			participants: resolvedEngines.map((e) => ({
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
		});
	}, [plugin.chatapi, resolvedEngines, plugin.settings]);

	// Override orchestrator's profile resolution to use actual settings
	useEffect(() => {
		orchestrator.engines = resolvedEngines.map((e) => ({
			id: e.id,
			name: e.name,
			color: e.color,
			profile: e.profile,
		}));
	}, [orchestrator, resolvedEngines]);

	// Auto-scroll to bottom
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [session.messages.length]);

	// Auto-title
	useEffect(() => {
		if (session.title) return;
		if (session.messages.filter((m) => m.role === "user").length >= 1) {
			const title = generateGroupTitle(session.messages);
			setSession((prev) => ({ ...prev, title }));
		}
	}, [session.messages, session.title]);

	const handleSend = useCallback(
		async (text: string) => {
			if (!text.trim() || isStreaming) return;

			const userMsg: ChatMessage = {
				id: makeId(),
				role: "user",
				content: text,
				timestamp: Date.now(),
			};

			setSession((prev) => ({
				...prev,
				messages: [...prev.messages, userMsg],
				updatedAt: Date.now(),
			}));
			setIsStreaming(true);
			controllerRef.current = new AbortController();

			// Determine which agents should respond
			const { targets } = orchestrator.parseAndRoute(text);
			const targetNames = targets.map((t) => t.name);
			setTypingAgents(new Set(targetNames));

			try {
				const responses: AgentResponse[] = [];
				for await (const response of orchestrator.dispatch(
					text,
					session.messages,
				)) {
					responses.push(response);
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
					};

					setSession((prev) => ({
						...prev,
						messages: [...prev.messages, assistantMsg],
						updatedAt: Date.now(),
					}));
				}
			} catch (error: any) {
				new Notice(`❌ Group chat error: ${error.message}`);
				const errorMsg: ChatMessage = {
					id: makeId(),
					role: "assistant",
					content: `⚠️ Orchestrator error: ${error.message}`,
					timestamp: Date.now(),
					isError: true,
				};
				setSession((prev) => ({
					...prev,
					messages: [...prev.messages, errorMsg],
					updatedAt: Date.now(),
				}));
			} finally {
				setIsStreaming(false);
				setTypingAgents(new Set());
				controllerRef.current = null;
			}
		},
		[isStreaming, plugin, orchestrator, session.messages],
	);

	const handleStop = useCallback(() => {
		controllerRef.current?.abort();
		setIsStreaming(false);
		setTypingAgents(new Set());
	}, []);

	const handleAddMention = useCallback((item: ContextItem) => {
		// Context mentions from ChatInput — add to session context
		setSession((prev) => {
			const existing = new Set(prev.contextItems.map((i) => {
				if (i.type === "note") return `note:${i.path}`;
				if (i.type === "folder") return `folder:${i.path}`;
				if (i.type === "tag") return `tag:${i.tag}`;
				return `active:${i.id}`;
			}));
			const key =
				item.type === "note"
					? `note:${item.path}`
					: item.type === "folder"
						? `folder:${item.path}`
						: item.type === "tag"
							? `tag:${item.tag}`
							: `active:${item.id}`;
			if (existing.has(key)) return prev;
			return { ...prev, contextItems: [...prev.contextItems, item] };
		});
	}, []);

	const handleClearChat = useCallback(() => {
		setSession((prev) => ({
			...prev,
			messages: [],
			title: "",
			updatedAt: Date.now(),
		}));
	}, []);

	const handleNewSession = useCallback(() => {
		setSession({
			id: makeId(),
			title: "",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			messages: [],
			contextItems: [],
			isGroupChat: true,
			participants: DEFAULT_PARTICIPANTS,
		});
	}, []);

	return (
		<div className="chat-app-container">
			{/* Participant roster */}
			<div className="group-chat-roster">
				{participants.map((p) => (
					<div
						key={p.id}
						className="group-chat-participant"
						style={{ borderColor: p.color }}
					>
						<span className="group-chat-participant-icon">{p.icon}</span>
						<span className="group-chat-participant-name">{p.name}</span>
						{typingAgents.has(p.name) && (
							<span className="group-chat-typing">thinking…</span>
						)}
					</div>
				))}
			</div>

			{/* Simple action bar for group chat */}
			<div className="chat-action-bar">
				<div className="chat-action-bar-left">
					<button className="chat-btn chat-icon-btn" onClick={handleNewSession} title="New council session">
						<ObsidianIcon icon="plus" size={15} />
					</button>
					<button className="chat-btn chat-icon-btn" onClick={handleClearChat} title="Clear chat">
						<ObsidianIcon icon="trash-2" size={15} />
					</button>
				</div>
				<div className="chat-action-bar-center">
					<span className="chat-session-title-display" title={session.title || "AI Council"}>
						{session.title || "AI Council"}
					</span>
				</div>
				<div className="chat-action-bar-right">
					<span className="group-chat-badge">Council</span>
				</div>
			</div>

			<div className="chat-messages-scroll">
				{session.messages.map((msg) => (
					<MessageBubble
						key={msg.id}
						message={msg}
						app={plugin.app}
						isStreaming={false}
						onAppend={() => {}}
						onInsertAtCursor={() => {}}
						onApply={() => {}}
						onRetry={() => {}}
						onEdit={() => {}}
						onApplyToTarget={() => {}}
						onCreateNote={() => {}}
						onAppendToTarget={() => {}}
					/>
				))}
				{typingAgents.size > 0 && (
					<div className="group-chat-typing-indicator">
						{Array.from(typingAgents).map((name) => (
							<span key={name} className="typing-agent">
								{name} is thinking…
							</span>
						))}
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			<ChatInput
				app={plugin.app}
				onSend={handleSend}
				onStop={handleStop}
				onAddMention={handleAddMention}
				isStreaming={isStreaming}
			/>
		</div>
	);
};

export default GroupChatApp;
