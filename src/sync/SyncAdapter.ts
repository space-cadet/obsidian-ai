import type { ChatMessage } from "../types";

/**
 * Unified interface for multi-user chat synchronization backends.
 *
 * Both WebSocket and WebRTC adapters implement this interface.
 * ChatApp is transport-agnostic — it only knows this interface.
 */
export interface SyncAdapter {
	/**
	 * Connect to a room as a given user.
	 * @param roomId - The room identifier (e.g., "physics-chat")
	 * @param userId - Display name for this user (e.g., "Alice")
	 */
	connect(roomId: string, userId: string): Promise<void>;

	/** Disconnect from the room and clean up resources. */
	disconnect(): void;

	/**
	 * Send a message to all other participants in the room.
	 */
	sendMessage(msg: ChatMessage): Promise<void>;

	/**
	 * Register a callback for incoming messages from other participants.
	 * The adapter calls this when a remote message arrives.
	 */
	onMessage(callback: (msg: ChatMessage) => void): void;

	/**
	 * Register a callback for room roster updates.
	 * Called when the adapter receives the full list of connected users.
	 */
	onUserList(callback: (users: string[]) => void): void;

	/**
	 * Register a callback for presence events (join/leave).
	 * Called when a user joins or leaves the room.
	 */
	onPresence(callback: (event: { type: "join" | "leave"; userId: string }) => void): void;

	/**
	 * Send a typing indicator to other participants.
	 */
	sendTyping(): void;

	/**
	 * Register a callback for typing events from other participants.
	 */
	onTyping(callback: (userId: string) => void): void;
}
