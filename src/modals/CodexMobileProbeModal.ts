import { App, Modal } from "obsidian";
import {
	CodexMobileCompatibilityProbe,
	CodexMobileProbeError,
	type CodexDeviceAuthorization,
	type CodexProbeCredential,
} from "../auth/CodexMobileCompatibilityProbe";

export class CodexMobileProbeModal extends Modal {
	private readonly probe: CodexMobileCompatibilityProbe;
	private modelInput: HTMLInputElement | null = null;
	private statusEl: HTMLElement | null = null;
	private authorizationEl: HTMLElement | null = null;
	private actionsEl: HTMLElement | null = null;
	private authorization: CodexDeviceAuthorization | null = null;
	private credential: CodexProbeCredential | null = null;
	private busy = false;
	private closed = false;

	constructor(app: App, pluginVersion: string) {
		super(app);
		this.probe = new CodexMobileCompatibilityProbe({ pluginVersion });
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: "Experimental Codex mobile login test",
		});
		contentEl.createEl("p", {
			text: "This developer probe uses Codex device sign-in and an undocumented Codex response endpoint. It sends one short prompt and may use your Codex plan allowance. Tokens stay in memory for this modal only; they are not saved to plugin settings, exports, or sync.",
		});
		contentEl.createEl("p", {
			text: "Use this only for compatibility testing. OpenAI does not document the response endpoint as a plugin integration.",
		});

		const modelLabel = contentEl.createEl("label", {
			text: "Model used for the single test request",
		});
		this.modelInput = modelLabel.createEl("input");
		this.modelInput.type = "text";
		this.modelInput.placeholder =
			"Enter a model available to your Codex account";
		this.modelInput.autocomplete = "off";
		this.modelInput.spellcheck = false;

		this.authorizationEl = contentEl.createDiv();
		this.statusEl = contentEl.createDiv();
		this.statusEl.setText(
			"Ready. Start only when you want to run the probe.",
		);
		this.actionsEl = contentEl.createDiv();
		this.renderActions();
	}

	onClose(): void {
		this.closed = true;
		this.probe.cancel();
		this.authorization = null;
		this.credential = null;
		this.modelInput = null;
		this.authorizationEl?.empty();
		this.statusEl?.empty();
		this.actionsEl?.empty();
	}

	private renderActions(): void {
		if (!this.actionsEl) return;
		this.actionsEl.empty();

		if (this.busy && this.authorization) {
			const cancel = this.actionsEl.createEl("button", {
				text: "Cancel sign-in",
			});
			cancel.addEventListener("click", () => {
				this.probe.cancel();
				this.setStatus(
					"Cancelling. The current network request may finish before it stops.",
				);
			});
			return;
		}

		if (this.credential) {
			const refresh = this.actionsEl.createEl("button", {
				text: "Test token refresh",
			});
			refresh.disabled = this.busy;
			refresh.addEventListener("click", () => {
				void this.refresh();
			});
			const clear = this.actionsEl.createEl("button", {
				text: "Clear temporary login",
			});
			clear.disabled = this.busy;
			clear.addEventListener("click", () => this.clearCredential());
			return;
		}

		const start = this.actionsEl.createEl("button", {
			text: this.busy ? "Starting…" : "Start mobile test",
		});
		start.addClass("mod-cta");
		start.disabled = this.busy;
		start.addEventListener("click", () => {
			void this.start();
		});
	}

	private async start(): Promise<void> {
		if (this.busy || this.closed) return;
		const model = this.modelInput?.value.trim() ?? "";
		if (!model) {
			this.setStatus("Enter a model name before starting.");
			return;
		}
		this.busy = true;
		this.renderActions();
		this.setStatus("Requesting a device code…");
		try {
			const authorization = await this.probe.beginDeviceAuthorization();
			if (this.closed) return;
			this.authorization = authorization;
			this.showAuthorization(authorization);
			this.setStatus(
				"Approve the sign-in in your browser. This screen will check for approval.",
			);
			this.renderActions();

			const credential =
				await this.probe.completeDeviceAuthorization(authorization);
			if (this.closed) return;
			this.credential = credential;
			this.authorization = null;
			this.authorizationEl?.empty();
			this.setStatus(
				"Sign-in completed. Sending one short test request…",
			);
			this.renderActions();

			const result = await this.probe.sendTestResponse(credential, model);
			if (this.closed) return;
			this.setStatus("Mobile login and one Codex response succeeded.");
			this.statusEl?.createEl("pre", { text: result });
		} catch (error) {
			if (!this.closed) {
				this.authorization = null;
				this.setStatus(this.describeError(error));
			}
		} finally {
			this.busy = false;
			if (!this.closed) this.renderActions();
		}
	}

	private async refresh(): Promise<void> {
		if (!this.credential || this.busy || this.closed) return;
		this.busy = true;
		this.renderActions();
		this.setStatus("Checking token refresh…");
		try {
			this.credential = await this.probe.refreshCredential(
				this.credential,
			);
			if (this.closed) return;
			this.setStatus(
				"Token refresh succeeded. The updated credential remains in memory only.",
			);
		} catch (error) {
			if (!this.closed) this.setStatus(this.describeError(error));
		} finally {
			this.busy = false;
			if (!this.closed) this.renderActions();
		}
	}

	private clearCredential(): void {
		this.probe.cancel();
		this.authorization = null;
		this.credential = null;
		this.authorizationEl?.empty();
		this.setStatus(
			"The temporary login was cleared from this probe. Remote access was not revoked.",
		);
		this.renderActions();
	}

	private showAuthorization(authorization: CodexDeviceAuthorization): void {
		const container = this.authorizationEl;
		if (!container) return;
		container.empty();
		container.createEl("p", { text: "One-time code" });
		container.createEl("strong", { text: authorization.userCode });
		container.createEl("p", {
			text: "Open the verification page in a browser and enter this code:",
		});
		const link = container.createEl("a", {
			text: authorization.verificationUri,
			href: authorization.verificationUri,
		});
		link.target = "_blank";
		link.rel = "noopener noreferrer";
	}

	private describeError(error: unknown): string {
		if (error instanceof CodexMobileProbeError) return error.message;
		return "The mobile compatibility probe failed. No response details were saved.";
	}

	private setStatus(message: string): void {
		this.statusEl?.setText(message);
	}
}
