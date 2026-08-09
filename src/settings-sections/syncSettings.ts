import { Notice } from "obsidian";
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
				const ipMatch = /([0-9]{1,3}\.){3}[0-9]{1,3}/.exec(ice.candidate.candidate);
				resolve(ipMatch ? ipMatch[0] : null);
			};
			setTimeout(() => resolve(null), 3000);
		} catch {
			resolve(null);
		}
	});
}

export function renderSyncSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (opts?: { quiet?: boolean }) => Promise<void>,
): void {
	const section = containerEl.createEl("div", {
		cls: "obsidian-ai-settings-section",
		attr: { id: "obsidian-ai-settings-multi-user-sync" },
	});

	section.createEl("h2", { text: "Multi-User Sync" });

	const desc = section.createEl("p", { cls: "setting-item-description" });
	desc.innerHTML =
		"Connect to a WebSocket relay server to synchronize chat sessions across multiple devices or users. " +
		"When enabled on a chat session, messages are broadcast to all peers in the same room.";

	// Relay URL
	const relayRow = section.createEl("div", { cls: "setting-item" });
	relayRow.createEl("div", { cls: "setting-item-info", text: "Relay URL" });
	const relayControl = relayRow.createEl("div", { cls: "setting-item-control" });
	const relayInput = relayControl.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.syncRelayUrl,
		placeholder: "ws://localhost:8080",
	});
	relayInput.style.minWidth = "240px";

	const detectBtn = relayControl.createEl("button", {
		text: "🔍 Detect Local IP",
		cls: "mod-cta",
	});
	detectBtn.style.marginLeft = "8px";

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

	relayInput.addEventListener("change", async () => {
		plugin.settings.syncRelayUrl = relayInput.value.trim();
		await saveSettings({ quiet: true });
	});

	// Room ID
	const roomRow = section.createEl("div", { cls: "setting-item" });
	roomRow.createEl("div", { cls: "setting-item-info", text: "Default Room ID" });
	const roomControl = roomRow.createEl("div", { cls: "setting-item-control" });
	const roomInput = roomControl.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.syncRoomId,
		placeholder: "obsidian-ai-chat",
	});
	roomInput.style.minWidth = "200px";
	roomInput.addEventListener("change", async () => {
		plugin.settings.syncRoomId = roomInput.value.trim();
		await saveSettings({ quiet: true });
	});

	// User Name
	const nameRow = section.createEl("div", { cls: "setting-item" });
	nameRow.createEl("div", { cls: "setting-item-info", text: "Your Name" });
	const nameControl = nameRow.createEl("div", { cls: "setting-item-control" });
	const nameInput = nameControl.createEl("input", {
		type: "text",
		cls: "obsidian-ai-settings-input",
		value: plugin.settings.syncUserName,
		placeholder: "User",
	});
	nameInput.style.minWidth = "150px";
	nameInput.addEventListener("change", async () => {
		plugin.settings.syncUserName = nameInput.value.trim();
		await saveSettings({ quiet: true });
	});

	// Hint
	const hint = section.createEl("p", { cls: "setting-item-description" });
	hint.style.marginTop = "12px";
	hint.innerHTML =
		"<strong>Note:</strong> Relay connection is configured per chat session. " +
		"Enable it from the chat toolbar (🔌 icon) after starting a new chat.";
}
