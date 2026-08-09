#!/usr/bin/env node
/**
 * WebSocket relay server for obsidian-ai multi-user chat with presence tracking.
 *
 * Usage:
 *   node relay/server.js [PORT]
 *
 * Default port: 8080
 *
 * Behavior:
 * - Accepts WebSocket connections at /ws/:roomId?userId=Alice
 * - Groups clients by room
 * - Tracks userId per connection for presence
 * - Broadcasts messages to all other clients in the same room
 * - Sends join/leave events and room roster
 * - No persistence, no auth — just a pipe with presence
 */

const WebSocket = require("ws");
const http = require("http");
const url = require("url");

const PORT = parseInt(process.argv[2], 10) || 8080;

// roomId -> Map<WebSocket, userId>
const rooms = new Map();

function getRoom(roomId) {
	if (!rooms.has(roomId)) {
		rooms.set(roomId, new Map());
	}
	return rooms.get(roomId);
}

function removeClient(roomId, ws) {
	const room = rooms.get(roomId);
	if (!room) return null;
	const userId = room.get(ws);
	room.delete(ws);
	if (room.size === 0) {
		rooms.delete(roomId);
	}
	return userId;
}

function getUserList(roomId) {
	const room = rooms.get(roomId);
	if (!room) return [];
	return Array.from(room.values());
}

function broadcast(roomId, sender, message) {
	const room = rooms.get(roomId);
	if (!room) return;

	const data = typeof message === "string" ? message : JSON.stringify(message);

	for (const [client] of room) {
		if (client !== sender && client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	}
}

function send(ws, message) {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(typeof message === "string" ? message : JSON.stringify(message));
	}
}

const server = http.createServer((req, res) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
	res.setHeader("Content-Type", "application/json");

	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}

	const parsed = url.parse(req.url, true);

	// GET /rooms — list all rooms with user counts
	if (parsed.pathname === "/rooms") {
		const roomData = {};
		for (const [roomId, room] of rooms) {
			roomData[roomId] = Array.from(room.values());
		}
		res.writeHead(200);
		res.end(JSON.stringify({ status: "ok", rooms: roomData }));
		return;
	}

	// GET /rooms/:roomId — get users in a specific room
	const roomMatch = parsed.pathname.match(/^\/rooms\/(.+)$/);
	if (roomMatch) {
		const roomId = roomMatch[1];
		const users = getUserList(roomId);
		res.writeHead(200);
		res.end(JSON.stringify({ status: "ok", roomId, users }));
		return;
	}

	// GET / — health check + room summary
	res.writeHead(200);
	const roomData = {};
	for (const [roomId, room] of rooms) {
		roomData[roomId] = Array.from(room.values());
	}
	res.end(JSON.stringify({ status: "ok", rooms: roomData }));
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
	const parsed = url.parse(req.url, true);
	const roomId = parsed.pathname.replace(/^\/ws\//, "") || "default";
	const userId = parsed.query.userId || "anonymous";

	console.log(`[relay] Client joined room: ${roomId} as ${userId}`);

	const room = getRoom(roomId);

	// Send current room roster to new client
	const existingUsers = getUserList(roomId);
	if (existingUsers.length > 0) {
		send(ws, { type: "roster", users: existingUsers });
	}

	// Add client to room
	room.set(ws, userId);

	// Broadcast join to others
	broadcast(roomId, ws, { type: "join", userId });

	ws.on("message", (raw) => {
		try {
			const msg = JSON.parse(raw);

			// Handle presence messages internally, don't broadcast them as chat
			if (msg.type === "join" || msg.type === "leave" || msg.type === "roster") {
				return;
			}

			console.log(
				`[relay] ${roomId}: ${msg.agentName || msg.agentId || userId}: ${msg.content?.slice(0, 50) || ""}`
			);
			broadcast(roomId, ws, raw);
		} catch {
			// If not JSON, just forward raw
			broadcast(roomId, ws, raw);
		}
	});

	ws.on("close", () => {
		const leftUserId = removeClient(roomId, ws);
		if (leftUserId) {
			console.log(`[relay] Client left room: ${roomId} (${leftUserId})`);
			broadcast(roomId, ws, { type: "leave", userId: leftUserId });
		}
	});

	ws.on("error", (err) => {
		console.error(`[relay] WebSocket error in ${roomId}:`, err.message);
		const leftUserId = removeClient(roomId, ws);
		if (leftUserId) {
			broadcast(roomId, ws, { type: "leave", userId: leftUserId });
		}
	});
});

server.listen(PORT, () => {
	console.log(`[relay] WebSocket relay running on port ${PORT}`);
	console.log(`[relay] For same-device testing: ws://localhost:${PORT}/ws/:roomId?userId=Alice`);
	console.log(`[relay] For cross-device: find this device's local IP, then use:`);
	console.log(`[relay]   ws://<this-device-ip>:${PORT}/ws/:roomId?userId=Alice`);
	console.log(`[relay] Find your IP: ipconfig getifaddr en0  (macOS) or ip addr  (Linux)`);
});

// Graceful shutdown
process.on("SIGINT", () => {
	console.log("\n[relay] Shutting down...");
	wss.clients.forEach((ws) => ws.close());
	server.close(() => process.exit(0));
});
