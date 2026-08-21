import { Notice, requestUrl } from "obsidian";
import ObsidianAIPlugin from "../main";

/** Try to detect local IP using WebRTC (works in Electron/Obsidian) */
function detectLocalIP(): Promise<string | null> {
	return new Promise((resolve) => {
		try {
			const pc = new RTCPeerConnection({ iceServers: [] });
			pc.createDataChannel("");
			pc.createOffer().then((o) => pc.setLocalDescription(o));
			pc.onicecandidate = (ice) => {
				if (!ice || !ice.candidate || !ice.candidate.candidate) {
					resolve(null);
					return;
				}
				const ipMatch = /([0-9]{1,3}\.){3}[0-9]{1,3}/.exec(
					ice.candidate.candidate,
				);
				resolve(ipMatch ? ipMatch[0] : null);
			};
			setTimeout(() => resolve(null), 3000);
		} catch {
			resolve(null);
		}
	});
}

/** Test if a relay URL is reachable */
async function testRelayConnection(relayUrl: string): Promise<{
	ok: boolean;
	rooms?: Record<string, string[]>;
	error?: string;
}> {
	try {
		// Convert ws:// to http:// for the test
		const httpUrl = relayUrl
			.replace(/^ws:\/\//, "http://")
			.replace(/^wss:\/\//, "https://");
		const res = await requestUrl({
			url: `${httpUrl}/rooms`,
			method: "GET",
		});

		if (res.status < 200 || res.status >= 300) {
			return { ok: false, error: `HTTP ${res.status}` };
		}

		const data = JSON.parse(res.text);
		return { ok: true, rooms: data.rooms };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { ok: false, error: msg };
	}
}

/** Render the Multi-User Chat Relay settings section */
export function renderSyncSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (opts?: { quiet?: boolean }) => Promise<void>,
): void {
	const section = containerEl.createEl("div", {
		cls: "obsidian-ai-settings-section",
		attr: { id: "obsidian-ai-settings-multi-user-chat-relay" },
	});

	section.createEl("h2", { text: "Multi-User Chat Relay" });

	const desc = section.createEl("p", { cls: "setting-item-description" });
	desc.textContent =
		"Connect to a WebSocket relay server to synchronize chat sessions across multiple devices or users. " +
		"When enabled on a chat session, messages are broadcast to all peers in the same room.";

	// ── Relay URL row ──
	const relayRow = section.createEl("div", { cls: "setting-item" });
	relayRow.createEl("div", { cls: "setting-item-info", text: "Relay URL" });
	const relayControl = relayRow.createEl("div", {
		cls: "setting-item-control",
	});

	// URL input with history dropdown
	const urlWrapper = relayControl.createEl("div", {
		cls: "obsidian-ai-url-wrapper",
	});
	urlWrapper.setCssStyles({
		display: "flex",
		alignItems: "center",
		gap: "4px",
	});

	const relayInput = urlWrapper.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.syncRelayUrl,
		placeholder: "ws://localhost:8080",
	});
	relayInput.setCssStyles({ minWidth: "200px" });

	// History dropdown (if any entries exist)
	const history = plugin.settings.syncRelayUrlHistory;
	if (history.length > 0) {
		const historySelect = urlWrapper.createEl("select", {
			cls: "dropdown",
		});
		historySelect.createEl("option", { text: "History…", value: "" });
		for (const url of history) {
			historySelect.createEl("option", { text: url, value: url });
		}
		historySelect.addEventListener("change", () => {
			if (historySelect.value) {
				relayInput.value = historySelect.value;
				plugin.settings.syncRelayUrl = historySelect.value;
				saveSettings({ quiet: true });
			}
			historySelect.value = ""; // reset to placeholder
		});
	}

	relayInput.addEventListener("change", async () => {
		const url = relayInput.value.trim();
		plugin.settings.syncRelayUrl = url;
		// Add to history if new and valid-looking
		if (url && !plugin.settings.syncRelayUrlHistory.includes(url)) {
			plugin.settings.syncRelayUrlHistory.unshift(url);
			if (plugin.settings.syncRelayUrlHistory.length > 10) {
				plugin.settings.syncRelayUrlHistory.pop();
			}
		}
		await saveSettings({ quiet: true });
	});

	// ── Test + Detect buttons ──
	const btnRow = section.createEl("div", { cls: "setting-item" });
	btnRow.setCssStyles({ borderTop: "none", paddingTop: "0" });
	const btnControl = btnRow.createEl("div", { cls: "setting-item-control" });
	btnControl.setCssStyles({ display: "flex", gap: "8px" });

	// Test Connection button
	const testBtn = btnControl.createEl("button", {
		text: "🧪 Test Connection",
		cls: "mod-cta",
	});

	// Detect Local IP button
	const detectBtn = btnControl.createEl("button", {
		text: "🔍 Detect Local IP",
		cls: "mod-cta",
	});

	testBtn.addEventListener("click", async () => {
		testBtn.disabled = true;
		testBtn.textContent = "Testing…";
		const result = await testRelayConnection(relayInput.value.trim());
		testBtn.disabled = false;
		testBtn.textContent = "🧪 Test Connection";

		if (result.ok) {
			const roomCount = result.rooms
				? Object.keys(result.rooms).length
				: 0;
			const roomNames = result.rooms
				? Object.keys(result.rooms).join(", ")
				: "none";
			new Notice(
				`✅ Relay reachable! ${roomCount} room(s): ${roomNames}`,
			);
			// Populate room browser
			populateRoomBrowser(result.rooms ?? {});
		} else {
			new Notice(`❌ Relay unreachable: ${result.error}`);
		}
	});

	detectBtn.addEventListener("click", async () => {
		const ip = await detectLocalIP();
		if (ip) {
			relayInput.value = `ws://${ip}:8080`;
			plugin.settings.syncRelayUrl = relayInput.value;
			await saveSettings({ quiet: true });
			new Notice(`Detected local IP: ${ip}`);
		} else {
			new Notice("Could not detect local IP. Enter manually.");
		}
	});

	// ── Room Browser ──
	const roomBrowserSection = section.createEl("div", {
		cls: "obsidian-ai-room-browser",
	});
	roomBrowserSection.setCssStyles({ marginTop: "12px", display: "none" });

	const roomBrowserTitle = roomBrowserSection.createEl("h3", {
		text: "Available Rooms",
		cls: "obsidian-ai-room-browser-title",
	});
	roomBrowserTitle.setCssStyles({ fontSize: "0.9em", marginBottom: "8px" });

	const roomList = roomBrowserSection.createEl("div", {
		cls: "obsidian-ai-room-list",
	});

	function populateRoomBrowser(rooms: Record<string, string[]>) {
		roomList.empty();
		const roomIds = Object.keys(rooms);
		if (roomIds.length === 0) {
			roomList.createEl("p", {
				text: "No active rooms on this relay.",
				cls: "setting-item-description",
			});
		} else {
			for (const [roomId, users] of Object.entries(rooms)) {
				const row = roomList.createEl("div", {
					cls: "obsidian-ai-room-row",
				});
				row.setCssStyles({
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "4px 8px",
					borderRadius: "4px",
					cursor: "pointer",
					marginBottom: "4px",
				});

				const info = row.createEl("span");
				info.createEl("strong", { text: roomId });
				info.appendText(
					` — ${users.length} user(s): ${users.join(", ")}`,
				);

				const joinBtn = row.createEl("button", {
					text: "Join",
					cls: "mod-cta",
				});
				joinBtn.setCssStyles({ fontSize: "0.8em", padding: "2px 8px" });

				row.addEventListener("click", (e) => {
					if (e.target === joinBtn) return;
					roomInput.value = roomId;
					plugin.settings.syncRoomId = roomId;
					saveSettings({ quiet: true });
					new Notice(`Room set to: ${roomId}`);
				});

				joinBtn.addEventListener("click", () => {
					roomInput.value = roomId;
					plugin.settings.syncRoomId = roomId;
					saveSettings({ quiet: true });
					new Notice(`Room set to: ${roomId}`);
				});
			}
		}
		roomBrowserSection.setCssStyles({ display: "block" });
	}

	// ── Room ID ──
	const roomRow = section.createEl("div", { cls: "setting-item" });
	roomRow.createEl("div", {
		cls: "setting-item-info",
		text: "Default Room ID",
	});
	const roomControl = roomRow.createEl("div", {
		cls: "setting-item-control",
	});
	const roomInput = roomControl.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.syncRoomId,
		placeholder: "obsidian-ai-chat",
	});
	roomInput.setCssStyles({ minWidth: "200px" });
	roomInput.addEventListener("change", async () => {
		plugin.settings.syncRoomId = roomInput.value.trim();
		await saveSettings({ quiet: true });
	});

	// ── User Name ──
	const nameRow = section.createEl("div", { cls: "setting-item" });
	nameRow.createEl("div", { cls: "setting-item-info", text: "Your Name" });
	const nameControl = nameRow.createEl("div", {
		cls: "setting-item-control",
	});
	const nameInput = nameControl.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.syncUserName,
		placeholder: "User",
	});
	nameInput.setCssStyles({ minWidth: "150px" });
	nameInput.addEventListener("change", async () => {
		plugin.settings.syncUserName = nameInput.value.trim();
		await saveSettings({ quiet: true });
	});

	// ── Hint ──
	const hint = section.createEl("p", { cls: "setting-item-description" });
	hint.setCssStyles({ marginTop: "12px" });
	hint.createEl("strong", { text: "Note: " });
	hint.appendText(
		"Relay connection is configured per chat session. Enable it from the chat toolbar (🔌 icon) after starting a new chat.",
	);
}
