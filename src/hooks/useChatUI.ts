import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage } from "../types";
import type { Attachment } from "../types";

export interface UseChatUIResult {
	// --- Modals ---
	showSessionPicker: boolean;
	setShowSessionPicker: React.Dispatch<React.SetStateAction<boolean>>;
	openSessionPicker: () => void;
	closeSessionPicker: () => void;

	showExportModal: boolean;
	setShowExportModal: React.Dispatch<React.SetStateAction<boolean>>;
	openExportModal: () => void;
	closeExportModal: () => void;

	showContextPicker: boolean;
	setShowContextPicker: React.Dispatch<React.SetStateAction<boolean>>;
	openContextPicker: () => void;
	closeContextPicker: () => void;

	// --- Zen / Debate ---
	zenMode: boolean;
	setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
	toggleZenMode: () => void;

	debateMode: boolean;
	setDebateMode: React.Dispatch<React.SetStateAction<boolean>>;
	toggleDebateMode: () => void;

	// --- Thinking display ---
	showThinking: boolean;
	toggleShowThinking: () => void;

	// --- Participants ---
	selectedProfileIds: Set<string>;
	setSelectedProfileIds: React.Dispatch<React.SetStateAction<Set<string>>>;
	toggleProfile: (profileId: string) => void;

	showParticipantDropdown: boolean;
	toggleParticipantDropdown: () => void;
	closeParticipantDropdown: () => void;
	participantDropdownRef: React.RefObject<HTMLDivElement | null>;

	// --- Typing ---
	typingAgents: Set<string>;
	setTypingAgents: React.Dispatch<React.SetStateAction<Set<string>>>;
	addTypingAgent: (name: string) => void;
	removeTypingAgent: (name: string) => void;
	clearTypingAgents: () => void;

	// --- Auto-approve ---
	autoApprove: boolean;
	setAutoApprove: React.Dispatch<React.SetStateAction<boolean>>;
	toggleAutoApprove: () => void;

	// --- Editing ---
	isEditing: boolean;
	setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
	editMessageText: string;
	setEditMessageText: React.Dispatch<React.SetStateAction<string>>;
	originalMessages: ChatMessage[];
	setOriginalMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
	startEditing: (text: string) => void;
	cancelEditing: () => void;

	// --- Attachments ---
	messageAttachments: Attachment[];
	setMessageAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;

	// --- Remote users ---
	connectedUsers: string[];
	setConnectedUsers: React.Dispatch<React.SetStateAction<string[]>>;
	selectedRemoteUserIds: Set<string>;
	setSelectedRemoteUserIds: React.Dispatch<React.SetStateAction<Set<string>>>;
	toggleRemoteUser: (userId: string) => void;
	showRemoteUserDropdown: boolean;
	toggleRemoteUserDropdown: () => void;
	closeRemoteUserDropdown: () => void;
	remoteUserDropdownRef: React.RefObject<HTMLDivElement | null>;

	// --- Reset ---
	resetUIState: () => void;
}

/**
 * Hook for managing UI state in the chat panel.
 * Extracted from ChatApp to separate presentation concerns from logic.
 */
export function useChatUI(): UseChatUIResult {
	// --- Modals ---
	const [showSessionPicker, setShowSessionPicker] = useState(false);
	const [showExportModal, setShowExportModal] = useState(false);
	const [showContextPicker, setShowContextPicker] = useState(false);

	const openSessionPicker = useCallback(() => setShowSessionPicker(true), []);
	const closeSessionPicker = useCallback(() => setShowSessionPicker(false), []);
	const openExportModal = useCallback(() => setShowExportModal(true), []);
	const closeExportModal = useCallback(() => setShowExportModal(false), []);
	const openContextPicker = useCallback(() => setShowContextPicker(true), []);
	const closeContextPicker = useCallback(() => setShowContextPicker(false), []);

	// --- Zen / Debate ---
	const [zenMode, setZenMode] = useState(false);
	const toggleZenMode = useCallback(() => setZenMode((z) => !z), []);

	const [debateMode, setDebateMode] = useState(false);
	const toggleDebateMode = useCallback(() => setDebateMode((d) => !d), []);

	// --- Thinking display ---
	const [showThinking, setShowThinking] = useState(false);
	const toggleShowThinking = useCallback(() => setShowThinking((t) => !t), []);

	// --- Participants ---
	const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(
		new Set(),
	);
	const toggleProfile = useCallback((profileId: string) => {
		setSelectedProfileIds((prev) => {
			const next = new Set(prev);
			if (next.has(profileId)) {
				next.delete(profileId);
			} else {
				next.add(profileId);
			}
			return next;
		});
	}, []);

	const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
	const toggleParticipantDropdown = useCallback(
		() => setShowParticipantDropdown((s) => !s),
		[],
	);
	const closeParticipantDropdown = useCallback(
		() => setShowParticipantDropdown(false),
		[],
	);
	const participantDropdownRef = useRef<HTMLDivElement>(null);

	// Close participant dropdown when clicking outside
	useEffect(() => {
		if (!showParticipantDropdown) return;
		const handleClick = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				!participantDropdownRef.current ||
				!participantDropdownRef.current.contains(target)
			) {
				setShowParticipantDropdown(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [showParticipantDropdown]);

	// --- Remote users ---
	const [connectedUsers, setConnectedUsers] = useState<string[]>([]);
	const [selectedRemoteUserIds, setSelectedRemoteUserIds] = useState<Set<string>>(new Set());
	const toggleRemoteUser = useCallback((userId: string) => {
		setSelectedRemoteUserIds((prev) => {
			const next = new Set(prev);
			if (next.has(userId)) {
				next.delete(userId);
			} else {
				next.add(userId);
			}
			return next;
		});
	}, []);
	const [showRemoteUserDropdown, setShowRemoteUserDropdown] = useState(false);
	const toggleRemoteUserDropdown = useCallback(
		() => setShowRemoteUserDropdown((s) => !s),
		[],
	);
	const closeRemoteUserDropdown = useCallback(
		() => setShowRemoteUserDropdown(false),
		[],
	);
	const remoteUserDropdownRef = useRef<HTMLDivElement>(null);

	// Close remote user dropdown when clicking outside
	useEffect(() => {
		if (!showRemoteUserDropdown) return;
		const handleClick = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				!remoteUserDropdownRef.current ||
				!remoteUserDropdownRef.current.contains(target)
			) {
				setShowRemoteUserDropdown(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [showRemoteUserDropdown]);

	// --- Typing ---
	const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set());
	const addTypingAgent = useCallback((name: string) => {
		setTypingAgents((prev) => {
			const next = new Set(prev);
			next.add(name);
			return next;
		});
	}, []);
	const removeTypingAgent = useCallback((name: string) => {
		setTypingAgents((prev) => {
			const next = new Set(prev);
			next.delete(name);
			return next;
		});
	}, []);
	const clearTypingAgents = useCallback(() => setTypingAgents(new Set()), []);

	// --- Auto-approve ---
	const [autoApprove, setAutoApprove] = useState(false);
	const toggleAutoApprove = useCallback(() => setAutoApprove((a) => !a), []);

	// --- Editing ---
	const [isEditing, setIsEditing] = useState(false);
	const [originalMessages, setOriginalMessages] = useState<ChatMessage[]>([]);
	const [editMessageText, setEditMessageText] = useState("");

	const startEditing = useCallback((text: string) => {
		setEditMessageText(text);
		setIsEditing(true);
	}, []);

	const cancelEditing = useCallback(() => {
		setIsEditing(false);
		setOriginalMessages([]);
		setEditMessageText("");
	}, []);

	// --- Attachments ---
	const [messageAttachments, setMessageAttachments] = useState<Attachment[]>(
		[],
	);

	// --- Reset ---
	const resetUIState = useCallback(() => {
		setShowSessionPicker(false);
		setShowExportModal(false);
		setShowContextPicker(false);
		setZenMode(false);
		setDebateMode(false);
		setShowThinking(false);
		setSelectedProfileIds(new Set());
		setShowParticipantDropdown(false);
		setConnectedUsers([]);
		setSelectedRemoteUserIds(new Set());
		setShowRemoteUserDropdown(false);
		setTypingAgents(new Set());
		setAutoApprove(false);
		setIsEditing(false);
		setOriginalMessages([]);
		setEditMessageText("");
		setMessageAttachments([]);
	}, []);

	return {
		// Modals
		showSessionPicker,
		setShowSessionPicker,
		openSessionPicker,
		closeSessionPicker,
		showExportModal,
		setShowExportModal,
		openExportModal,
		closeExportModal,
		showContextPicker,
		setShowContextPicker,
		openContextPicker,
		closeContextPicker,
		// Zen / Debate
		zenMode,
		setZenMode,
		toggleZenMode,
		debateMode,
		setDebateMode,
		toggleDebateMode,
		// Thinking
		showThinking,
		toggleShowThinking,
		// Participants
		selectedProfileIds,
		setSelectedProfileIds,
		toggleProfile,
		showParticipantDropdown,
		toggleParticipantDropdown,
		closeParticipantDropdown,
		participantDropdownRef,
		// Remote users
		connectedUsers,
		setConnectedUsers,
		selectedRemoteUserIds,
		setSelectedRemoteUserIds,
		toggleRemoteUser,
		showRemoteUserDropdown,
		toggleRemoteUserDropdown,
		closeRemoteUserDropdown,
		remoteUserDropdownRef,
		// Typing
		typingAgents,
		setTypingAgents,
		addTypingAgent,
		removeTypingAgent,
		clearTypingAgents,
		// Auto-approve
		autoApprove,
		setAutoApprove,
		toggleAutoApprove,
		// Editing
		isEditing,
		setIsEditing,
		editMessageText,
		setEditMessageText,
		originalMessages,
		setOriginalMessages,
		startEditing,
		cancelEditing,
		// Attachments
		messageAttachments,
		setMessageAttachments,
		// Reset
		resetUIState,
	};
}
