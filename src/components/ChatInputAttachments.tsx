import React, { useEffect, useRef, useState } from "react";
import { App, Notice, TFile } from "obsidian";
import { Attachment } from "../types";
import { createAttachment } from "../context/AttachmentEngine";

interface ChatInputAttachmentsProps {
	app: App;
	attachments: Attachment[];
	onAttachmentsChange?: (attachments: Attachment[]) => void;
	onFiles: (files: FileList | null) => void;
	thinkingEnabled?: boolean;
	onToggleThinking?: () => void;
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
	onToggleThinking,
	tokenTotal,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

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
				{onToggleThinking && (
					<button
						className={`chat-input-thinking${thinkingEnabled ? " is-active" : ""}`}
						type="button"
						onClick={onToggleThinking}
						title={
							thinkingEnabled
								? "Thinking mode ON — Click to disable"
								: "Thinking mode OFF — Click to enable"
						}
					>
						{thinkingEnabled ? "🧠" : "💤"}
					</button>
				)}
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
