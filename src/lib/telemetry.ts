/**
 * Telemetry module — T51
 * Opt-in, anonymized usage collection.
 * No data is sent without explicit user consent.
 */

import { Notice } from "obsidian";
import ObsidianAIPlugin from "../main";

const TELEMETRY_ENDPOINT = "https://quantumofgravity.com/telemetry";
const FLUSH_INTERVAL_MS = 60000; // 60 seconds
const MAX_QUEUE_SIZE = 50;

export interface TelemetryEvent {
	timestamp?: number;
	event: string;
	provider?: string;
	feature?: string;
	value?: number;
	errorType?: string;
	setting?: string;
}

interface TelemetryPayload {
	id: string;
	version: string;
	events: TelemetryEvent[];
}

class TelemetryManager {
	private plugin: ObsidianAIPlugin | null = null;
	private queue: TelemetryEvent[] = [];
	private flushTimer: number | null = null;
	private enabled = false;

	init(plugin: ObsidianAIPlugin): void {
		this.plugin = plugin;
		this.enabled = plugin.settings.telemetryEnabled;
		if (this.enabled) {
			this.startFlushTimer();
		}
	}

	/**
	 * Log a telemetry event. If telemetry is disabled, this is a no-op.
	 */
	log(event: TelemetryEvent): void {
		if (!this.enabled || !this.plugin) return;
		this.queue.push({
			...event,
			timestamp: Date.now(),
		});
		if (this.queue.length >= MAX_QUEUE_SIZE) {
			void this.flush();
		}
	}

	/**
	 * Enable or disable telemetry. Stops/starts the flush timer accordingly.
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (enabled) {
			this.startFlushTimer();
		} else {
			this.stopFlushTimer();
			// Clear queue when disabling — user opted out
			this.queue = [];
		}
	}

	/**
	 * Flush queued events to the backend. Silent fail on error.
	 */
	async flush(): Promise<void> {
		if (!this.plugin || this.queue.length === 0) return;

		const payload: TelemetryPayload = {
			id: this.plugin.settings.telemetryId || getOrCreateTelemetryId(),
			version: this.plugin.manifest.version,
			events: this.queue.splice(0), // clear queue
		};

		try {
			const response = await fetch(TELEMETRY_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!response.ok) {
				// Silent fail — telemetry must never break the plugin
				console.debug("[telemetry] flush failed:", response.status);
			}
		} catch {
			// Silent fail — don't nag users about telemetry errors
			console.debug("[telemetry] flush error (network)");
		}
	}

	/**
	 * Flush any remaining events before plugin unload.
	 */
	destroy(): void {
		this.stopFlushTimer();
		void this.flush();
	}

	private startFlushTimer(): void {
		if (this.flushTimer !== null) return;
		this.flushTimer = window.setInterval(() => {
			void this.flush();
		}, FLUSH_INTERVAL_MS);
	}

	private stopFlushTimer(): void {
		if (this.flushTimer !== null) {
			window.clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
	}
}

/**
 * Get or create a stable, random telemetry ID.
 * Stored in localStorage — NOT derived from any user data.
 */
export function getOrCreateTelemetryId(): string {
	const key = "obsidian-ai-telemetry-id";
	let id = localStorage.getItem(key);
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem(key, id);
	}
	return id;
}

/**
 * Bucket token counts to prevent fingerprinting by exact usage.
 */
export function bucketTokens(count: number): string {
	if (count < 1000) return "<1K";
	if (count < 10000) return "1K-10K";
	if (count < 100000) return "10K-100K";
	if (count < 1000000) return "100K-1M";
	return ">1M";
}

/**
 * Show first-run telemetry opt-in dialog.
 * Returns true if user enabled telemetry, false otherwise.
 */
export async function showTelemetryOptInDialog(
	plugin: ObsidianAIPlugin,
): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = document.createElement("div");
		modal.className = "obsidian-ai-telemetry-modal modal-bg";
		modal.innerHTML = `
			<div class="modal" style="max-width: 480px;">
				<div class="modal-header">
					<h2>Help Improve Obsidian AI?</h2>
				</div>
				<div class="modal-content" style="padding: 16px 20px;">
					<p style="margin-bottom: 12px;">
						You can optionally share <strong>anonymous usage statistics</strong> to help us prioritize features and fix issues.
					</p>
					<div style="background: var(--background-secondary); border-radius: 6px; padding: 12px; margin-bottom: 12px; font-size: 0.9em;">
						<div style="margin-bottom: 8px; font-weight: 600;">We collect:</div>
						<ul style="margin: 0; padding-left: 18px; line-height: 1.6;">
							<li>Which AI providers you use</li>
							<li>Which features you find helpful</li>
							<li>How long conversations typically are (ranges)</li>
							<li>Error types (not messages)</li>
						</ul>
					</div>
					<div style="background: var(--background-secondary); border-radius: 6px; padding: 12px; margin-bottom: 12px; font-size: 0.9em;">
						<div style="margin-bottom: 8px; font-weight: 600; color: var(--text-error);">We NEVER collect:</div>
						<ul style="margin: 0; padding-left: 18px; line-height: 1.6;">
							<li>Your messages or notes</li>
							<li>Your API keys</li>
							<li>Your file names or vault structure</li>
							<li>Your identity or IP address</li>
						</ul>
					</div>
				</div>
				<div class="modal-button-container" style="padding: 12px 20px 20px; justify-content: space-between;">
					<button class="mod-muted" id="telemetry-not-now">Not Now</button>
					<button class="mod-cta" id="telemetry-enable">Enable Telemetry</button>
				</div>
			</div>
		`;

		document.body.appendChild(modal);

		const cleanup = () => {
			modal.remove();
		};

		modal.querySelector("#telemetry-enable")?.addEventListener("click", () => {
			cleanup();
			resolve(true);
		});

		modal.querySelector("#telemetry-not-now")?.addEventListener("click", () => {
			cleanup();
			resolve(false);
		});

		// Close on backdrop click
		modal.addEventListener("click", (e) => {
			if (e.target === modal) {
				cleanup();
				resolve(false);
			}
		});
	});
}

// Singleton instance
export const telemetry = new TelemetryManager();
