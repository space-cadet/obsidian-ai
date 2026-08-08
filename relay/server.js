#!/usr/bin/env node
/**
 * Minimal WebSocket relay server for obsidian-ai multi-user chat.
 *
 * Usage:
 *   node relay/server.js [PORT]
 *
 * Default port: 8080
 *
 * Behavior:
 * - Accepts WebSocket connections
 * - Groups clients by room (from URL path /ws/:roomId)
 * - Broadcasts messages to all other clients in the same room
 * - No persistence, no auth — just a dumb pipe
 */

const WebSocket = require("ws");
const http = require("http");
const url = require("url");

const PORT = parseInt(process.argv[2], 10) || 8080;

// roomId -> Set<WebSocket>
const rooms = new Map();

function getRoomClients(roomId) {
	if (!rooms.has(roomId)) {
		rooms.set(roomId, new Set());
	}
	return rooms.get(roomId);
}

function removeClient(roomId, ws) {
	const clients = rooms.get(roomId);
	if (clients) {
		clients.delete(ws);
		if (clients.size === 0) {
			rooms.delete(roomId);
		}
	}
}

function broadcast(roomId, sender, message) {
	const clients = rooms.get(roomId);
	if (!clients) return;

	const data = typeof message === "string" ? message : JSON.stringify(message);

	for (const client of clients) {
		if (client !== sender && client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	}
}

const server = http.createServer((req, res) => {
	res.writeHead(200, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ status: "ok", rooms: Array.from(rooms.keys()) }));
});

const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
	const parsed = url.parse(req.url, true);
	const roomId = parsed.pathname.replace(/^\/ws\//, "") || "default";

	console.log(`[relay] Client joined room: ${roomId}`);

	const clients = getRoomClients(roomId);
	clients.add(ws);

	ws.on("message", (raw) => {
		try {
			const msg = JSON.parse(raw);
			console.log(`[relay] ${roomId}: ${msg.userName || msg.userId || "?"}: ${msg.content?.slice(0, 50) || ""}`);
			broadcast(roomId, ws, raw);
		} catch {
			// If not JSON, just forward raw
			broadcast(roomId, ws, raw);
		}
	});

	ws.on("close", () => {
		console.log(`[relay] Client left room: ${roomId}`);
		removeClient(roomId, ws);
	});

	ws.on("error", (err) => {
		console.error(`[relay] WebSocket error in ${roomId}:`, err.message);
		removeClient(roomId, ws);
	});
});

server.listen(PORT, () => {
	console.log(`[relay] WebSocket relay running on ws://localhost:${PORT}/ws/:roomId`);
	console.log(`[relay] Example: ws://localhost:${PORT}/ws/physics-chat`);
});

// Graceful shutdown
process.on("SIGINT", () => {
	console.log("\n[relay] Shutting down...");
	wss.clients.forEach((ws) => ws.close());
	server.close(() => process.exit(0));
});
