import React, { useEffect, useId, useRef, useState } from "react";
import { App, Notice, TFile } from "obsidian";
import { Attachment } from "../types";
import type { ThinkingMode } from "../types";
import type { ThinkingModeOption } from "../api/thinkingModes";
import { getThinkingModeLabel } from "../api/thinkingModes";
import { createAttachment } from "../context/AttachmentEngine";
import ObsidianIcon from "./ObsidianIcon";

interface ChatInputAttachmentsProps {
	app: App;
	attachments: Attachment[];
	onAttachmentsChange?: (attachments: Attachment[]) => void;
	onFiles: (files: FileList | null) => void;
	thinkingEnabled?: boolean;
	thinkingMode: ThinkingMode;
	thinkingModeOptions: ThinkingModeOption[];
	onThinkingModeChange: (mode: ThinkingMode) => void;
	tokenTotal?: string;
}

type VaultFileType = "note" | "image" | "pdf";

function openVaultFilePicker(
	app: App,
	type: VaultFileType,
	onSelect: (attachment: Attachment) => void,
): void {
	const extensions: Record<VaultFileType, string[]> = {
		note: ["md"],
		image: ["png", "jpg", "jpeg", "gif", "webp", "bmp"],
		pdf: ["pdf"],
	};
	const files = app.vault
		.getAllLoadedFiles()
		.filter(
			(file): file is TFile =>
				file instanceof TFile &&
				extensions[type].includes(file.extension),
		);

	if (files.length === 0) {
		new Notice(`No ${type} files found in vault.`);
		return;
	}

	const modal = document.body.createEl("div", { cls: "chat-attach-modal" });
	const content = modal.createEl("div", { cls: "chat-attach-modal-content" });
	content.createEl("h4", {
		text: `Select ${type === "note" ? "Note" : type === "image" ? "Image" : "PDF"}`,
	});
	const list = content.createEl("div", { cls: "chat-attach-list" });
	const cancelButton = content.createEl("button", {
		text: "Cancel",
		cls: "chat-btn chat-attach-cancel",
	});
	files.forEach((file) => {
		const item = list.createEl("div", {
			text: file.path,
			cls: "chat-attach-item",
		});
		item.addEventListener("click", () => {
			onSelect(createAttachment(file.path));
			modal.remove();
		});
	});
	cancelButton.addEventListener("click", () => modal.remove());
}

const ChatInputAttachments: React.FC<ChatInputAttachmentsProps> = ({
	app,
	attachments,
	onAttachmentsChange,
	onFiles,
	thinkingEnabled,
	thinkingMode,
	thinkingModeOptions,
	onThinkingModeChange,
	tokenTotal,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const thinkingMenuRef = useRef<HTMLDivElement>(null);
	const thinkingButtonRef = useRef<HTMLButtonElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
	const thinkingMenuId = useId();

	useEffect(() => {
		if (!isOpen) return;
		const handlePointerDown = (event: MouseEvent) => {
			if (
				menuRef.current &&
				!menuRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handlePointerDown);
		return () =>
			document.removeEventListener("mousedown", handlePointerDown);
	}, [isOpen]);

	useEffect(() => {
		if (!thinkingMenuOpen) return;
		thinkingMenuRef.current
			?.querySelector<HTMLButtonElement>(
				"[role=radio][aria-checked=true]",
			)
			?.focus();
		const handlePointerDown = (event: MouseEvent) => {
			if (
				thinkingMenuRef.current &&
				!thinkingMenuRef.current.contains(event.target as Node)
			) {
				setThinkingMenuOpen(false);
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setThinkingMenuOpen(false);
				thinkingButtonRef.current?.focus();
			}
		};
		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [thinkingMenuOpen]);

	const handleThinkingMenuKeyDown = (
		event: React.KeyboardEvent<HTMLDivElement>,
	) => {
		if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
			return;
		event.preventDefault();
		const buttons = Array.from(
			thinkingMenuRef.current?.querySelectorAll<HTMLButtonElement>(
				"[role=radio]",
			) ?? [],
		);
		if (buttons.length === 0) return;
		const currentIndex = buttons.indexOf(
			document.activeElement as HTMLButtonElement,
		);
		const nextIndex =
			event.key === "Home"
				? 0
				: event.key === "End"
					? buttons.length - 1
					: (currentIndex +
							(event.key === "ArrowDown" ? 1 : -1) +
							buttons.length) %
						buttons.length;
		buttons[nextIndex].focus();
		const nextMode = buttons[nextIndex].dataset.thinkingMode as
			| ThinkingMode
			| undefined;
		if (nextMode) onThinkingModeChange(nextMode);
	};

	const addVaultFile = (type: VaultFileType) => {
		setIsOpen(false);
		openVaultFilePicker(app, type, (attachment) => {
			onAttachmentsChange?.([...attachments, attachment]);
		});
	};

	return (
		<div className="chat-input-toolbar">
			<div className="chat-input-toolbar-left">
				{attachments.map((attachment) => (
					<div key={attachment.id} className="chat-attachment-chip">
						<span className="chat-attachment-icon">
							{attachment.type === "image"
								? "🖼️"
								: attachment.type === "pdf"
									? "📑"
									: "📄"}
						</span>
						<span className="chat-attachment-name">
							{attachment.name}
						</span>
						<button
							className="chat-attachment-remove"
							type="button"
							onClick={() =>
								onAttachmentsChange?.(
									attachments.filter(
										(item) => item.id !== attachment.id,
									),
								)
							}
							title="Remove attachment"
						>
							×
						</button>
					</div>
				))}
				<div className="chat-input-attach-menu" ref={menuRef}>
					<button
						className="chat-input-attach"
						type="button"
						onClick={() => setIsOpen((open) => !open)}
						title="Attach file"
					>
						📎
					</button>
					{isOpen && (
						<div className="chat-attach-dropdown">
							{(
								[
									["note", "📄", "Attach Note"],
									["image", "🖼️", "Attach Image"],
									["pdf", "📑", "Attach PDF"],
								] as const
							).map(([type, icon, label]) => (
								<div
									key={type}
									className="chat-attach-dropdown-item"
									onMouseDown={(event) => {
										event.preventDefault();
										addVaultFile(type);
									}}
								>
									<span>{icon}</span>
									<span>{label}</span>
								</div>
							))}
							<div className="chat-attach-dropdown-divider" />
							<div
								className="chat-attach-dropdown-item"
								onMouseDown={(event) => {
									event.preventDefault();
									setIsOpen(false);
									fileInputRef.current?.click();
								}}
							>
								<span>📁</span>
								<span>Browse External File</span>
							</div>
						</div>
					)}
				</div>
				<div className="chat-thinking-control" ref={thinkingMenuRef}>
					<button
						ref={thinkingButtonRef}
						className={`chat-input-thinking${thinkingEnabled ? " is-active" : ""}`}
						type="button"
						onClick={() => setThinkingMenuOpen((open) => !open)}
						title={`Thinking mode: ${getThinkingModeLabel(thinkingMode)}`}
						aria-label={`Thinking mode: ${getThinkingModeLabel(thinkingMode)}`}
						aria-expanded={thinkingMenuOpen}
						aria-controls={thinkingMenuId}
					>
						<span aria-hidden="true">
							<ObsidianIcon icon="brain" size={16} />
						</span>
					</button>
					{thinkingMenuOpen && (
						<div
							className="chat-thinking-dropdown"
							id={thinkingMenuId}
							role="radiogroup"
							aria-label="Thinking mode"
							onKeyDown={handleThinkingMenuKeyDown}
						>
							<div className="chat-thinking-dropdown-title">
								Thinking mode
							</div>
							{thinkingModeOptions.map((option) => (
								<button
									key={option.value}
									className="chat-thinking-option"
									type="button"
									role="radio"
									data-thinking-mode={option.value}
									aria-checked={thinkingMode === option.value}
									tabIndex={
										thinkingMode === option.value ? 0 : -1
									}
									onClick={() => {
										onThinkingModeChange(option.value);
										setThinkingMenuOpen(false);
										thinkingButtonRef.current?.focus();
									}}
								>
									<span className="chat-thinking-option-label">
										{option.label}
									</span>
									<span className="chat-thinking-option-description">
										{option.description}
									</span>
								</button>
							))}
							{thinkingModeOptions.length === 1 && (
								<p className="chat-thinking-unavailable">
									This model does not expose adjustable
									thinking modes.
								</p>
							)}
						</div>
					)}
				</div>
				{tokenTotal && (
					<span className="chat-input-token-total">{tokenTotal}</span>
				)}
			</div>
			<input
				ref={fileInputRef}
				type="file"
				style={{ display: "none" }}
				accept="image/*,.pdf,.txt,.md"
				multiple
				onChange={(event) => {
					onFiles(event.currentTarget.files);
					event.currentTarget.value = "";
				}}
			/>
		</div>
	);
};

export default ChatInputAttachments;
