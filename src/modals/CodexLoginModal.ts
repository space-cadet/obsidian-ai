import { App, Modal, Platform } from "obsidian";
import {
	getCodexRegistrationCredential,
	getOrCreateCodexHostId,
} from "../auth/CodexCredentials";
import {
	completeCodexAuthorization,
	createCodexAuthorizationAttempt,
	type CodexAccountCredential,
	type CodexAuthorizationAttempt,
} from "../auth/CodexSiwc";
import {
	CODEX_REDIRECT_URI,
	startCodexLoopbackCallbackListener,
	type CodexLoopbackCallbackListener,
} from "../auth/CodexLoopbackCallback";

export class CodexLoginModal extends Modal {
	private readonly profileId: string;
	private readonly onAuthorized: (
		credential: CodexAccountCredential,
	) => Promise<void>;
	private statusEl: HTMLElement | null = null;
	private authorizationEl: HTMLElement | null = null;
	private actionsEl: HTMLElement | null = null;
	private callbackInputEl: HTMLTextAreaElement | null = null;
	private attempt: CodexAuthorizationAttempt | null = null;
	private callbackListener: CodexLoopbackCallbackListener | null = null;
	private hostId: string | null = null;
	private busy = false;
	private verifying = false;
	private connected = false;
	private closed = false;

	constructor(
		app: App,
		profileId: string,
		onAuthorized: (credential: CodexAccountCredential) => Promise<void>,
	) {
		super(app);
		this.profileId = profileId;
		this.onAuthorized = onAuthorized;
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.createEl("h2", { text: "Connect Codex with ChatGPT" });
		this.contentEl.createEl("p", {
			text: "Sign in with ChatGPT and approve ChatGPT plan use. This lets Chat Lab load your account's models and send Codex requests through the public Responses API.",
		});
		this.authorizationEl = this.contentEl.createDiv();
		this.statusEl = this.contentEl.createDiv({
			text: "Continue to prepare a secure sign-in.",
		});
		this.actionsEl = this.contentEl.createDiv();
		this.renderActions();
	}

	onClose(): void {
		this.closed = true;
		this.callbackListener?.close();
		this.callbackListener = null;
		this.attempt = null;
		this.statusEl = null;
		this.authorizationEl = null;
		this.actionsEl = null;
		this.callbackInputEl = null;
	}

	private renderActions(): void {
		if (!this.actionsEl) return;
		this.actionsEl.empty();

		if (this.connected) {
			const done = this.actionsEl.createEl("button", { text: "Done" });
			done.addClass("mod-cta");
			done.addEventListener("click", () => this.close());
			return;
		}

		if (this.busy) {
			if (this.attempt && this.callbackInputEl && !this.verifying) {
				const usePasted = this.actionsEl.createEl("button", {
					text: "Use pasted callback URL",
				});
				usePasted.addClass("mod-cta");
				usePasted.addEventListener(
					"click",
					() => void this.completeManualSignIn(),
				);
			}
			const cancel = this.actionsEl.createEl("button", {
				text: "Cancel sign-in",
			});
			cancel.addEventListener("click", () => this.cancelSignIn());
			return;
		}

		if (this.attempt) {
			const complete = this.actionsEl.createEl("button", {
				text: "Complete sign-in",
			});
			complete.addClass("mod-cta");
			complete.addEventListener(
				"click",
				() => void this.completeManualSignIn(),
			);
			const cancel = this.actionsEl.createEl("button", {
				text: "Cancel",
			});
			cancel.addEventListener("click", () => this.cancelSignIn());
			return;
		}

		const start = this.actionsEl.createEl("button", {
			text: "Continue with ChatGPT",
		});
		start.addClass("mod-cta");
		start.addEventListener("click", () => void this.startSignIn());
	}

	private async startSignIn(): Promise<void> {
		if (this.busy || this.closed) return;
		this.busy = true;
		this.renderActions();
		this.setStatus("Preparing secure sign-in…");
		try {
			const existingCredential = getCodexRegistrationCredential(
				this.app,
				this.profileId,
			);
			this.hostId = getOrCreateCodexHostId(this.app);
			this.callbackListener = await startCodexLoopbackCallbackListener(
				Platform.isMobile,
			);
			const attempt = await createCodexAuthorizationAttempt({
				extAgentHostId: this.hostId,
				redirectUri: CODEX_REDIRECT_URI,
				existingCredential,
			});
			if (this.closed) {
				this.callbackListener?.close();
				this.callbackListener = null;
				return;
			}
			this.attempt = attempt;
			this.showAuthorization(Boolean(this.callbackListener));
			this.setStatus(
				this.callbackListener
					? "Open the sign-in link. Chat Lab will finish when the browser returns to this device."
					: "Open the sign-in link and approve ChatGPT plan use. Then copy the final browser address and paste it below.",
			);
			this.busy = Boolean(this.callbackListener);
			this.renderActions();
			if (this.callbackListener) {
				void this.waitForLoopbackCallback(
					this.callbackListener,
					attempt,
				);
			}
		} catch (error) {
			this.callbackListener?.close();
			this.callbackListener = null;
			if (!this.closed) {
				this.setStatus(this.describeError(error));
				this.busy = false;
				this.renderActions();
			}
		}
	}

	private showAuthorization(hasLoopbackListener: boolean): void {
		const container = this.authorizationEl;
		if (!container || !this.attempt) return;
		container.empty();
		const link = container.createEl("a", {
			text: "Open ChatGPT sign-in",
			href: this.attempt.authorizationUrl,
		});
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		container.createEl("p", {
			text: hasLoopbackListener
				? "After approval, the browser returns to Chat Lab automatically."
				: "On mobile, the browser may say 127.0.0.1 refused the connection. Copy the full address-bar URL from that page and paste it here.",
		});
		container.createEl("label", { text: "Sign-in callback URL" });
		this.callbackInputEl = container.createEl("textarea", {
			attr: {
				rows: "3",
				placeholder: `${CODEX_REDIRECT_URI}?code=…&state=…`,
				autocapitalize: "off",
				autocomplete: "off",
				spellcheck: "false",
			},
		});
	}

	private async waitForLoopbackCallback(
		listener: CodexLoopbackCallbackListener,
		attempt: CodexAuthorizationAttempt,
	): Promise<void> {
		const callbackUrl = await listener.callbackUrl;
		if (this.closed || this.callbackListener !== listener) return;
		this.callbackListener = null;
		if (!callbackUrl) {
			this.busy = false;
			this.setStatus(
				"No callback arrived. Copy the browser's final address and paste it below.",
			);
			this.renderActions();
			return;
		}
		await this.finishSignIn(attempt, callbackUrl);
	}

	private async completeManualSignIn(): Promise<void> {
		if (!this.attempt || this.closed) return;
		const callbackUrl = this.callbackInputEl?.value.trim() ?? "";
		if (!callbackUrl) {
			this.setStatus(
				"Paste the full callback URL from the sign-in browser.",
			);
			return;
		}
		if (this.callbackInputEl) this.callbackInputEl.value = "";
		this.callbackListener?.close();
		this.callbackListener = null;
		await this.finishSignIn(this.attempt, callbackUrl);
	}

	private async finishSignIn(
		attempt: CodexAuthorizationAttempt,
		callbackUrl: string,
	): Promise<void> {
		this.busy = true;
		this.verifying = true;
		this.renderActions();
		this.setStatus("Verifying sign-in and ChatGPT plan permission…");
		try {
			const credential = await completeCodexAuthorization(
				callbackUrl,
				attempt,
				{
					extAgentHostId:
						this.hostId ?? getOrCreateCodexHostId(this.app),
					existingCredential: getCodexRegistrationCredential(
						this.app,
						this.profileId,
					),
				},
			);
			if (this.closed || this.attempt !== attempt) return;
			await this.onAuthorized(credential);
			if (this.closed || this.attempt !== attempt) return;
			this.connected = true;
			this.attempt = null;
			this.callbackListener?.close();
			this.callbackListener = null;
			this.authorizationEl?.empty();
			const planAccessGranted =
				credential.scopes.includes("chatgpt.tokens.use.direct") &&
				credential.scopes.includes("resource.invoke");
			this.setStatus(
				planAccessGranted
					? "ChatGPT plan access is ready. Return to provider settings to fetch models."
					: "You are signed in, but ChatGPT plan use was not approved. Reconnect to request it before using Codex.",
			);
		} catch (error) {
			if (!this.closed && this.attempt === attempt) {
				this.attempt = null;
				this.callbackListener?.close();
				this.callbackListener = null;
				this.setStatus(this.describeError(error));
			}
		} finally {
			this.busy = false;
			this.verifying = false;
			if (!this.closed) this.renderActions();
		}
	}

	private cancelSignIn(): void {
		this.callbackListener?.close();
		this.callbackListener = null;
		this.attempt = null;
		this.busy = false;
		this.verifying = false;
		this.authorizationEl?.empty();
		this.setStatus("Sign-in cancelled.");
		this.renderActions();
	}

	private describeError(error: unknown): string {
		if (error instanceof Error && error.message) return error.message;
		return "ChatGPT sign-in failed.";
	}

	private setStatus(message: string): void {
		this.statusEl?.setText(message);
	}
}
