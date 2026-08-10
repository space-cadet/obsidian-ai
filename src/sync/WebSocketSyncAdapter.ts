import type { ChatMessage } from "../types";
import type { SyncAdapter } from "./SyncAdapter";

/**
 * WebSocket-based sync adapter with presence tracking.
 *
 * Connects to a relay server that broadcasts messages and presence events
 * to all clients in the same room.
 *
 * Usage:
 *   const sync = new WebSocketSyncAdapter("ws://localhost:8080");
 *   await sync.connect("physics-chat", "Alice");
 *   sync.onMessage((msg) => console.log("Remote:", msg.content));
 *   sync.onUserList((users) => console.log("Online:", users));
 *   sync.onPresence((event) => console.log(event.type, event.userId));
 *   await sync.sendMessage({ id: "1", role: "user", content: "Hi!", ... });
 */
export class WebSocketSyncAdapter implements SyncAdapter {
	private ws: WebSocket | null = null;
	private messageCallback: ((msg: ChatMessage) => void) | null = null;
	private userListCallback: ((users: string[]) => void) | null = null;
	private presenceCallback: ((event: { type: "join" | "leave"; userId: string }) => void) | null = null;
	private roomId: string = "";
	private userId: string = "";
	private reconnectTimer: number | null = null;
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 5;
	private readonly reconnectDelay = 2000;

	private explicitlyDisconnected = false;

	constructor(private readonly relayUrl: string) {}

	async connect(roomId: string, userId: string): Promise<void> {
		this.roomId = roomId;
		this.userId = userId;
		this.reconnectAttempts = 0;
		this.explicitlyDisconnected = false;

		// Validate relay URL format
		if (!this.relayUrl.startsWith("ws://") && !this.relayUrl.startsWith("wss://")) {
			throw new Error(
				`Relay URL must start with ws:// or wss:// (got: ${this.relayUrl})`
			);
		}

		return this.doConnect();
	}

	private doConnect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const wsUrl = `${this.relayUrl}/ws/${encodeURIComponent(this.roomId)}?userId=${encodeURIComponent(this.userId)}`;
			this.ws = new WebSocket(wsUrl);

			this.ws.onopen = () => {
				console.log(`[WebSocketSync] Connected to ${wsUrl}`);
				this.reconnectAttempts = 0;
				resolve();
			};

			this.ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);

					// Handle presence events
					if (data.type === "roster" && Array.isArray(data.users)) {
						this.userListCallback?.(data.users);
						return;
					}
					if (data.type === "join" || data.type === "leave") {
						this.presenceCallback?.(data);
						return;
					}

					// Handle chat messages — unwrap relay envelope
					if (data.type === "message" && data.message) {
						const inner = data.message;
						// Only process messages from other users (not echo of our own)
						if (inner.sender !== this.userId) {
							const msg: ChatMessage = {
								id: inner.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
								role: inner.role || "user",
								content: inner.content,
								timestamp: typeof inner.timestamp === "number" ? inner.timestamp : Date.now(),
								agentId: inner.sender,
							};
							this.messageCallback?.(msg);
						}
					}
				} catch (err) {
					console.warn("[WebSocketSync] Failed to parse message:", err);
				}
			};

			this.ws.onclose = (event) => {
				console.log(
					`[WebSocketSync] Connection closed (code: ${event.code}, reason: ${event.reason || "none"})`
				);
				if (!this.explicitlyDisconnected) {
					this.attemptReconnect();
				}
			};

			this.ws.onerror = (event) => {
				// Browser WebSocket errors are generic Events — extract what we can
				const errorMsg =
					typeof event === "string"
						? event
						: "WebSocket connection failed — check relay URL and network";
				console.error("[WebSocketSync] WebSocket error:", errorMsg, event);
				reject(new Error(errorMsg));
			};
		});
	}

	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error("[WebSocketSync] Max reconnect attempts reached");
			return;
		}
		this.reconnectAttempts++;
		console.log(
			`[WebSocketSync] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`
		);
		this.reconnectTimer = window.setTimeout(() => {
			this.doConnect().catch(() => {
				// reconnect loop continues via onclose
			});
		}, this.reconnectDelay);
	}

	disconnect(): void {
		this.explicitlyDisconnected = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			// Remove handlers to prevent reconnect logic from firing
			this.ws.onclose = null;
			this.ws.onerror = null;
			this.ws.onmessage = null;
			this.ws.onopen = null;
			this.ws.close();
			this.ws = null;
		}
	}

	async sendMessage(msg: ChatMessage): Promise<void> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket not connected");
		}
		this.ws.send(JSON.stringify({ type: "chat", ...msg }));
	}

	onMessage(callback: (msg: ChatMessage) => void): void {
		this.messageCallback = callback;
	}

	onUserList(callback: (users: string[]) => void): void {
		this.userListCallback = callback;
	}

	onPresence(callback: (event: { type: "join" | "leave"; userId: string }) => void): void {
		this.presenceCallback = callback;
	}
}
