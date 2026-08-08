import type { ChatMessage } from "../types";
import type { SyncAdapter } from "./SyncAdapter";

/**
 * WebSocket-based sync adapter.
 *
 * Connects to a tiny relay server that broadcasts messages to all
 * clients in the same room. No persistence, no auth — just a pipe.
 *
 * Usage:
 *   const sync = new WebSocketSyncAdapter("ws://localhost:8080");
 *   await sync.connect("physics-chat", "Alice");
 *   sync.onMessage((msg) => console.log("Remote:", msg.content));
 *   await sync.sendMessage({ id: "1", role: "user", content: "Hi!", ... });
 */
export class WebSocketSyncAdapter implements SyncAdapter {
	private ws: WebSocket | null = null;
	private messageCallback: ((msg: ChatMessage) => void) | null = null;
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
		return this.doConnect();
	}

	private doConnect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const wsUrl = `${this.relayUrl}/ws/${encodeURIComponent(this.roomId)}`;
			this.ws = new WebSocket(wsUrl);

			this.ws.onopen = () => {
				console.log(`[WebSocketSync] Connected to ${wsUrl} as ${this.userId}`);
				this.reconnectAttempts = 0;
				resolve();
			};

			this.ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data) as ChatMessage;
					// Only process messages from other users (not echo of our own)
					if (msg.agentId !== this.userId) {
						this.messageCallback?.(msg);
					}
				} catch (err) {
					console.warn("[WebSocketSync] Failed to parse message:", err);
				}
			};

			this.ws.onclose = () => {
				console.log("[WebSocketSync] Connection closed");
				if (!this.explicitlyDisconnected) {
					this.attemptReconnect();
				}
			};

			this.ws.onerror = (err) => {
				console.error("[WebSocketSync] WebSocket error:", err);
				reject(err);
			};
		});
	}

	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.error("[WebSocketSync] Max reconnect attempts reached");
			return;
		}
		this.reconnectAttempts++;
		console.log(`[WebSocketSync] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);
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
		this.ws.send(JSON.stringify(msg));
	}

	onMessage(callback: (msg: ChatMessage) => void): void {
		this.messageCallback = callback;
	}
}
