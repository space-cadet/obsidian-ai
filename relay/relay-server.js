#!/usr/bin/env node
/**
 * Minimal WebSocket relay server for obsidian-ai multi-user sync.
 *
 * Usage:
 *   node relay-server.js [port]
 *
 * No persistence, no auth — just broadcasts JSON messages to all
 * clients in the same room path.
 */

const http = require("http");
const { parse } = require("url");

const PORT = parseInt(process.argv[2], 10) || 8080;

/** Map: roomId -> Set<WebSocket> */
const rooms = new Map();

const server = http.createServer((req, res) => {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("obsidian-ai relay OK\n");
});

// Minimal WebSocket upgrade handling (no ws library needed for basic relay)
server.on("upgrade", (request, socket, head) => {
	const { pathname } = parse(request.url || "/", true);
	const match = pathname.match(/^\/ws\/(.+)$/);
	if (!match) {
		socket.destroy();
		return;
	}
	const roomId = decodeURIComponent(match[1]);

	// Perform minimal WebSocket handshake
	const key = request.headers["sec-websocket-key"];
	if (!key) {
		socket.destroy();
		return;
	}
	const accept = require("crypto")
		.createHash("sha1")
		.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
		.digest("base64");

	socket.write(
		"HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		`Sec-WebSocket-Accept: ${accept}\r\n` +
		"\r\n",
	);

	if (!rooms.has(roomId)) {
		rooms.set(roomId, new Set());
	}
	const room = rooms.get(roomId);
	room.add(socket);
	console.log(`[relay] Client joined room: ${roomId} (${room.size} clients)`);

	// Minimal WebSocket frame parsing (text frames only)
	let buffer = Buffer.alloc(0);
	socket.on("data", (data) => {
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
				// 64-bit length — unlikely for our use case
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

			if (opcode === 0x08) {
				// Close frame
				socket.end();
				return;
			}
			if (opcode === 0x01 && fin) {
				// Text frame
				const text = payload.toString("utf8");
				// Broadcast to all other sockets in the same room
				for (const peer of room) {
					if (peer === socket || peer.destroyed) continue;
					// Build minimal text frame (no mask from server)
					const frameLen = payload.length;
					let frame;
					if (frameLen < 126) {
						frame = Buffer.allocUnsafe(2 + frameLen);
						frame[0] = 0x81;
						frame[1] = frameLen;
						payload.copy(frame, 2);
					} else if (frameLen < 65536) {
						frame = Buffer.allocUnsafe(4 + frameLen);
						frame[0] = 0x81;
						frame[1] = 126;
						frame.writeUInt16BE(frameLen, 2);
						payload.copy(frame, 4);
					} else {
						frame = Buffer.allocUnsafe(10 + frameLen);
						frame[0] = 0x81;
						frame[1] = 127;
						frame.writeBigUInt64BE(BigInt(frameLen), 2);
						payload.copy(frame, 10);
					}
					peer.write(frame);
				}
			}
		}
	});

	socket.on("close", () => {
		room.delete(socket);
		console.log(`[relay] Client left room: ${roomId} (${room.size} clients)`);
		if (room.size === 0) {
			rooms.delete(roomId);
		}
	});

	socket.on("error", (err) => {
		console.error(`[relay] Socket error in room ${roomId}:`, err.message);
	});
});

server.listen(PORT, () => {
	console.log(`[relay] Listening on ws://0.0.0.0:${PORT}/ws/<room-id>`);
	console.log(`[relay] Health check: http://0.0.0.0:${PORT}/`);
});
