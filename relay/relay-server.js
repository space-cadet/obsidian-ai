#!/usr/bin/env node
/**
 * WebSocket relay server for obsidian-ai multi-user sync.
 *
 * Usage:
 *   node relay-server.js [port]
 *
 * No persistence, no auth — just broadcasts JSON messages to all
 * clients in the same room path.
 *
 * Features:
 * - Room-based message broadcasting
 * - Automatic cleanup on disconnect/error/timeout
 * - WebSocket ping/pong to detect dead connections
 * - Detailed logging with client IDs and connection stats
 */

const http = require("http");
const { parse } = require("url");
const crypto = require("crypto");

const PORT = parseInt(process.argv[2], 10) || 8080;
const PING_INTERVAL_MS = 30000; // Send ping every 30s
const PONG_TIMEOUT_MS = 90000; // Disconnect if no activity for 90s

// ─── State ───────────────────────────────────────────────────────────

/** WeakMap: socket -> client metadata */
const clientMeta = new WeakMap();
let clientIdCounter = 0;

/** Map: roomId -> Set<Socket> */
const rooms = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────

function generateClientId() {
	return `c${++clientIdCounter}-${crypto.randomBytes(2).toString("hex")}`;
}

function formatDuration(ms) {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${(ms / 60000).toFixed(1)}m`;
}

function getRoomStats() {
	const stats = {};
	for (const [roomId, clients] of rooms) {
		stats[roomId] = {
			clientCount: clients.size,
			clients: Array.from(clients)
				.map((s) => {
					const meta = clientMeta.get(s);
					return meta
						? {
								id: meta.id,
								joinedAt: new Date(meta.joinedAt).toISOString(),
								lastActivity: new Date(
									meta.lastActivity,
								).toISOString(),
								remoteAddress: meta.remoteAddress,
								duration: formatDuration(
									Date.now() - meta.joinedAt,
								),
							}
						: { id: "unknown" };
				})
				.filter(Boolean),
		};
	}
	return stats;
}

/**
 * Remove a socket from its room and clean up metadata.
 * Idempotent — safe to call multiple times.
 */
function removeClient(socket, reason = "unknown") {
	const meta = clientMeta.get(socket);
	if (!meta) return false; // Already removed

	const { roomId, id, joinedAt } = meta;
	const room = rooms.get(roomId);
	const hadClient = room ? room.delete(socket) : false;
	const remaining = room ? room.size : 0;

	if (room && remaining === 0) {
		rooms.delete(roomId);
	}

	clientMeta.delete(socket);

	if (hadClient) {
		const duration = Date.now() - joinedAt;
		console.log(
			`[relay] Client left room: ${roomId} (${remaining} clients) [${id}, ${reason}, duration: ${formatDuration(duration)}]`,
		);
	}

	return hadClient;
}

/**
 * Build a WebSocket text frame (server-to-client, unmasked).
 */
function buildTextFrame(payload) {
	const frameLen = payload.length;
	if (frameLen < 126) {
		const frame = Buffer.allocUnsafe(2 + frameLen);
		frame[0] = 0x81; // FIN + text opcode
		frame[1] = frameLen;
		payload.copy(frame, 2);
		return frame;
	}
	if (frameLen < 65536) {
		const frame = Buffer.allocUnsafe(4 + frameLen);
		frame[0] = 0x81;
		frame[1] = 126;
		frame.writeUInt16BE(frameLen, 2);
		payload.copy(frame, 4);
		return frame;
	}
	const frame = Buffer.allocUnsafe(10 + frameLen);
	frame[0] = 0x81;
	frame[1] = 127;
	frame.writeBigUInt64BE(BigInt(frameLen), 2);
	payload.copy(frame, 10);
	return frame;
}

/**
 * Broadcast a message to all other clients in the room.
 */
function broadcast(roomId, senderSocket, payloadBuffer) {
	const room = rooms.get(roomId);
	if (!room) return;

	const frame = buildTextFrame(payloadBuffer);
	const senderMeta = clientMeta.get(senderSocket);

	for (const peer of room) {
		if (peer === senderSocket) continue;
		if (peer.destroyed) {
			removeClient(peer, "destroyed");
			continue;
		}
		try {
			peer.write(frame);
		} catch (err) {
			const peerMeta = clientMeta.get(peer);
			console.error(
				`[relay] Send failed to ${peerMeta?.id || "?"}: ${err.message}`,
			);
			removeClient(peer, "send-error");
		}
	}
}

// ─── HTTP Server ─────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
	const parsed = parse(req.url, true);

	if (parsed.pathname === "/") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify(
				{
					status: "ok",
					relay: "obsidian-ai",
					rooms: getRoomStats(),
					uptimeSeconds: Math.floor(process.uptime()),
				},
				null,
				2,
			),
		);
		return;
	}

	res.writeHead(404);
	res.end("Not found\n");
});

// ─── WebSocket Upgrade Handler ───────────────────────────────────────

server.on("upgrade", (request, socket, head) => {
	const { pathname } = parse(request.url || "/", true);
	const match = pathname.match(/^\/ws\/(.+)$/);
	if (!match) {
		console.log(
			`[relay] Rejected: invalid path ${pathname} from ${socket.remoteAddress || "unknown"}`,
		);
		socket.destroy();
		return;
	}

	const roomId = decodeURIComponent(match[1]);
	const remoteAddress = socket.remoteAddress || "unknown";

	// WebSocket handshake
	const key = request.headers["sec-websocket-key"];
	if (!key) {
		console.log(
			`[relay] Rejected: missing sec-websocket-key from ${remoteAddress}`,
		);
		socket.destroy();
		return;
	}

	const accept = crypto
		.createHash("sha1")
		.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
		.digest("base64");

	try {
		socket.write(
			"HTTP/1.1 101 Switching Protocols\r\n" +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				`Sec-WebSocket-Accept: ${accept}\r\n` +
				"\r\n",
		);
	} catch (err) {
		console.error(
			`[relay] Handshake failed for ${remoteAddress}: ${err.message}`,
		);
		socket.destroy();
		return;
	}

	// Initialize room
	if (!rooms.has(roomId)) {
		rooms.set(roomId, new Set());
	}
	const room = rooms.get(roomId);

	// Track client
	const clientId = generateClientId();
	const now = Date.now();
	clientMeta.set(socket, {
		id: clientId,
		roomId,
		joinedAt: now,
		lastActivity: now,
		remoteAddress,
	});
	room.add(socket);

	console.log(
		`[relay] Client joined room: ${roomId} (${room.size} clients) [${clientId}, ${remoteAddress}]`,
	);

	// ─── Socket Event Handlers ───────────────────────────────────────

	let cleanedUp = false;
	const cleanup = (reason) => {
		if (cleanedUp) return;
		cleanedUp = true;
		removeClient(socket, reason);
	};

	// Buffer for frame parsing
	let buffer = Buffer.alloc(0);
	let fragmentedBuffer = null; // For multi-frame text messages

	socket.on("data", (data) => {
		const meta = clientMeta.get(socket);
		if (meta) meta.lastActivity = Date.now();

		buffer = Buffer.concat([buffer, data]);

		while (buffer.length >= 2) {
			const firstByte = buffer[0];
			const secondByte = buffer[1];
			const fin = (firstByte & 0x80) !== 0;
			const opcode = firstByte & 0x0f;
			const masked = (secondByte & 0x80) !== 0;
			let payloadLen = secondByte & 0x7f;
			let offset = 2;

			if (payloadLen === 126) {
				if (buffer.length < 4) return;
				payloadLen = buffer.readUInt16BE(2);
				offset = 4;
			} else if (payloadLen === 127) {
				if (buffer.length < 10) return;
				payloadLen = Number(buffer.readBigUInt64BE(2));
				offset = 10;
			}

			const maskKeyLen = masked ? 4 : 0;
			if (buffer.length < offset + maskKeyLen + payloadLen) return;

			const maskKey = masked ? buffer.slice(offset, offset + 4) : null;
			offset += maskKeyLen;
			const payload = buffer.slice(offset, offset + payloadLen);
			buffer = buffer.slice(offset + payloadLen);

			if (masked && maskKey) {
				for (let i = 0; i < payload.length; i++) {
					payload[i] ^= maskKey[i % 4];
				}
			}

			// ── Control Frames ──
			if (opcode === 0x08) {
				// Close frame — acknowledge and close
				const meta2 = clientMeta.get(socket);
				console.log(
					`[relay] Close frame from ${meta2?.id || "?"} in room ${roomId}`,
				);
				// Send close frame back (echo payload if any)
				const closeFrameLen = 2 + payload.length;
				const closeFrame = Buffer.allocUnsafe(closeFrameLen);
				closeFrame[0] = 0x88; // FIN + close
				closeFrame[1] = payload.length;
				payload.copy(closeFrame, 2);
				try {
					socket.write(closeFrame);
				} catch (e) {
					// ignore
				}
				socket.end();
				cleanup("close-frame");
				return;
			}

			if (opcode === 0x09) {
				// Ping — send pong with same payload
				const pong = Buffer.allocUnsafe(2 + payload.length);
				pong[0] = 0x8a; // FIN + pong
				pong[1] = payload.length;
				payload.copy(pong, 2);
				try {
					socket.write(pong);
				} catch (e) {
					// ignore
				}
				continue;
			}

			if (opcode === 0x0a) {
				// Pong — activity updated above
				continue;
			}

			// ── Data Frames ──
			if (
				opcode === 0x01 ||
				(opcode === 0x00 && fragmentedBuffer !== null)
			) {
				// Text frame or continuation
				if (opcode === 0x01) {
					fragmentedBuffer = payload;
				} else {
					fragmentedBuffer = Buffer.concat([
						fragmentedBuffer,
						payload,
					]);
				}

				if (!fin) {
					continue; // Wait for more fragments
				}

				const text = fragmentedBuffer.toString("utf8");
				fragmentedBuffer = null;

				// Log with preview
				let preview = text;
				try {
					const msg = JSON.parse(text);
					const who =
						msg.agentName ||
						msg.agentId ||
						msg.userName ||
						msg.userId ||
						"?";
					const content = msg.content?.slice(0, 60) || "[no content]";
					preview = `${who}: ${content}`;
				} catch {
					preview = text.slice(0, 60);
				}

				const meta2 = clientMeta.get(socket);
				console.log(
					`[relay] ${roomId} | ${meta2?.id || "?"} → ${preview}`,
				);

				// Broadcast to room
				broadcast(roomId, socket, Buffer.from(text, "utf8"));
				continue;
			}

			// Unknown opcode — log and ignore
			const meta2 = clientMeta.get(socket);
			console.warn(
				`[relay] Unknown opcode ${opcode} from ${meta2?.id || "?"} in room ${roomId}`,
			);
		}
	});

	socket.on("end", () => {
		cleanup("end");
	});

	socket.on("close", () => {
		cleanup("close");
	});

	socket.on("error", (err) => {
		const meta = clientMeta.get(socket);
		console.error(
			`[relay] Socket error from ${meta?.id || "?"} in room ${roomId}: ${err.message}`,
		);
		cleanup("error");
	});

	socket.on("timeout", () => {
		const meta = clientMeta.get(socket);
		console.log(
			`[relay] Socket timeout from ${meta?.id || "?"} in room ${roomId}`,
		);
		socket.destroy();
		cleanup("timeout");
	});
});

// ─── Periodic Ping & Dead Connection Sweep ───────────────────────────

const pingInterval = setInterval(() => {
	const now = Date.now();

	for (const [roomId, clients] of rooms) {
		for (const socket of Array.from(clients)) {
			const meta = clientMeta.get(socket);
			if (!meta) {
				// Ghost socket — remove it
				clients.delete(socket);
				continue;
			}

			// Check for timeout (no activity including pongs)
			if (now - meta.lastActivity > PONG_TIMEOUT_MS) {
				console.log(
					`[relay] Timeout: ${meta.id} in room ${roomId} (inactive for ${formatDuration(now - meta.lastActivity)})`,
				);
				socket.destroy();
				removeClient(socket, "inactive");
				continue;
			}

			// Send WebSocket ping frame (server-initiated, unmasked)
			const pingFrame = Buffer.allocUnsafe(2);
			pingFrame[0] = 0x89; // FIN + ping
			pingFrame[1] = 0x00;
			try {
				socket.write(pingFrame);
			} catch (err) {
				console.error(
					`[relay] Ping failed for ${meta.id}: ${err.message}`,
				);
				socket.destroy();
				removeClient(socket, "ping-failed");
			}
		}
	}
}, PING_INTERVAL_MS);

// ─── Startup ─────────────────────────────────────────────────────────

server.listen(PORT, () => {
	console.log(`[relay] Listening on ws://0.0.0.0:${PORT}/ws/<room-id>`);
	console.log(`[relay] Health check: http://0.0.0.0:${PORT}/`);
	console.log(
		`[relay] Ping interval: ${PING_INTERVAL_MS}ms, timeout: ${PONG_TIMEOUT_MS}ms`,
	);
	console.log(`[relay] Press Ctrl+C to stop`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────

process.on("SIGINT", () => {
	console.log("\n[relay] Shutting down...");
	clearInterval(pingInterval);

	for (const [roomId, clients] of rooms) {
		for (const socket of clients) {
			// Send close frame
			const closeFrame = Buffer.allocUnsafe(2);
			closeFrame[0] = 0x88;
			closeFrame[1] = 0x00;
			try {
				socket.write(closeFrame);
			} catch (e) {
				// ignore
			}
			socket.destroy();
		}
	}

	server.close(() => {
		console.log("[relay] Server closed");
		process.exit(0);
	});
});
