import { App, Modal } from "obsidian";
import {
	CodexMobileCompatibilityProbe,
	CodexMobileProbeError,
	type CodexDeviceAuthorization,
	type CodexProbeCredential,
} from "../auth/CodexMobileCompatibilityProbe";

export class CodexLoginModal extends Modal {
	private readonly auth = new CodexMobileCompatibilityProbe();
	private readonly onAuthorized: (
		credential: CodexProbeCredential,
	) => Promise<void>;
	private statusEl: HTMLElement | null = null;
	private authorizationEl: HTMLElement | null = null;
	private actionsEl: HTMLElement | null = null;
	private authorization: CodexDeviceAuthorization | null = null;
	private busy = false;
	private connected = false;
	private closed = false;

	constructor(
		app: App,
		onAuthorized: (credential: CodexProbeCredential) => Promise<void>,
	) {
		super(app);
		this.onAuthorized = onAuthorized;
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.createEl("h2", { text: "Connect Codex" });
		this.contentEl.createEl("p", {
			text: "Sign in to your Codex account. The login stays with this provider profile and is stored in Obsidian's secure secret storage.",
		});
		this.authorizationEl = this.contentEl.createDiv();
		this.statusEl = this.contentEl.createDiv({
			text: "Start sign-in to get a one-time code.",
		});
		this.actionsEl = this.contentEl.createDiv();
		this.renderActions();
	}

	onClose(): void {
		this.closed = true;
		this.auth.cancel();
		this.authorization = null;
		this.statusEl = null;
		this.authorizationEl = null;
		this.actionsEl = null;
	}

	private renderActions(): void {
		if (!this.actionsEl) return;
		this.actionsEl.empty();

		if (this.busy && this.authorization) {
			const cancel = this.actionsEl.createEl("button", {
				text: "Cancel sign-in",
			});
			cancel.addEventListener("click", () => {
				this.auth.cancel();
				this.setStatus("Cancelling sign-in…");
			});
			return;
		}

		if (this.connected) {
			const done = this.actionsEl.createEl("button", { text: "Done" });
			done.addClass("mod-cta");
			done.addEventListener("click", () => this.close());
			return;
		}

		const start = this.actionsEl.createEl("button", {
			text: this.busy ? "Starting…" : "Sign in with Codex",
		});
		start.addClass("mod-cta");
		start.disabled = this.busy;
		start.addEventListener("click", () => void this.startSignIn());
	}

	private async startSignIn(): Promise<void> {
		if (this.busy || this.closed) return;
		this.busy = true;
		this.renderActions();
		this.setStatus("Requesting a sign-in code…");
		try {
			const authorization = await this.auth.beginDeviceAuthorization();
			if (this.closed) return;
			this.authorization = authorization;
			this.showAuthorization(authorization);
			this.setStatus(
				"Approve sign-in in your browser. This dialog will finish automatically.",
			);
			this.renderActions();

			const credential =
				await this.auth.completeDeviceAuthorization(authorization);
			if (this.closed) return;
			await this.onAuthorized(credential);
			if (this.closed) return;
			this.connected = true;
			this.authorization = null;
			this.authorizationEl?.empty();
			this.setStatus(
				"Codex is connected. Fetch the account's model list in the provider settings.",
			);
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

	private showAuthorization(authorization: CodexDeviceAuthorization): void {
		const container = this.authorizationEl;
		if (!container) return;
		container.empty();
		container.createEl("p", { text: "One-time code" });
		container.createEl("strong", { text: authorization.userCode });
		const copy = container.createEl("button", { text: "Copy code" });
		copy.addEventListener("click", () => {
			void navigator.clipboard?.writeText(authorization.userCode);
		});
		container.createEl("p", {
			text: "Open the verification page and enter this code:",
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
		if (error instanceof Error && error.message) return error.message;
		return "Codex sign-in failed.";
	}

	private setStatus(message: string): void {
		this.statusEl?.setText(message);
	}
}
