import React, { useMemo, useState } from "react";
import { App, TFile, TFolder } from "obsidian";
import { ContextItem } from "../types";

type TabType = "notes" | "folders" | "tags";

interface ContextPickerModalProps {
	app: App;
	onAdd: (items: ContextItem[]) => void;
	onClose: () => void;
}

function makeId(): string {
	return crypto.randomUUID();
}

const ContextPickerModal: React.FC<ContextPickerModalProps> = ({
	app,
	onAdd,
	onClose,
}) => {
	const [activeTab, setActiveTab] = useState<TabType>("notes");
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const allNotes = useMemo(() => {
		return app.vault
			.getMarkdownFiles()
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}, [app]);

	const allFolders = useMemo(() => {
		return app.vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder)
			.sort((a, b) => a.path.localeCompare(b.path));
	}, [app]);

	const allTags = useMemo(() => {
		const tagMap = (app.metadataCache as any).getTags() as Record<string, number>;
		return Object.entries(tagMap)
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count);
	}, [app]);

	const filteredNotes = useMemo(() => {
		const q = searchQuery.toLowerCase();
		if (!q) return allNotes;
		return allNotes.filter((f) =>
			f.basename.toLowerCase().includes(q),
		);
	}, [allNotes, searchQuery]);

	const filteredFolders = useMemo(() => {
		const q = searchQuery.toLowerCase();
		if (!q) return allFolders;
		return allFolders.filter(
			(f) =>
				f.path.toLowerCase().includes(q) ||
				f.name.toLowerCase().includes(q),
		);
	}, [allFolders, searchQuery]);

	const filteredTags = useMemo(() => {
		const q = searchQuery.toLowerCase().replace(/^#/, "");
		if (!q) return allTags;
		return allTags.filter((t) =>
			t.tag.toLowerCase().replace(/^#/, "").includes(q),
		);
	}, [allTags, searchQuery]);

	const toggleSelection = (key: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	const handleAdd = () => {
		const items: ContextItem[] = [];
		for (const key of selectedIds) {
			const [type, ...rest] = key.split(":");
			const value = rest.join(":");
			switch (type) {
				case "note": {
					const file = app.vault.getAbstractFileByPath(value);
					if (file instanceof TFile) {
						items.push({
							type: "note",
							path: file.path,
							name: file.basename,
							id: makeId(),
						});
					}
					break;
				}
				case "folder": {
					const folder = app.vault.getAbstractFileByPath(value);
					if (folder instanceof TFolder) {
						items.push({
							type: "folder",
							path: folder.path,
							name:
								folder.path === ""
									? "(vault root)"
									: folder.name,
							id: makeId(),
						});
					}
					break;
				}
				case "tag": {
					items.push({
						type: "tag",
						tag: value,
						id: makeId(),
					});
					break;
				}
			}
		}
		onAdd(items);
	};

	const tabButton = (tab: TabType, label: string) => (
		<button
			key={tab}
			className={`chat-picker-tab${activeTab === tab ? " chat-picker-tab-active" : ""}`}
			onClick={() => {
				setActiveTab(tab);
				setSearchQuery("");
			}}
		>
			{label}
		</button>
	);

	return (
		<div className="chat-modal-overlay" onClick={onClose}>
			<div className="chat-modal" onClick={(e) => e.stopPropagation()}>
				<div className="chat-modal-header">
					<h3>Add Context</h3>
					<button
						className="chat-modal-close"
						onClick={onClose}
						aria-label="Close"
					>
						×
					</button>
				</div>

				<div className="chat-picker-tabs">
					{tabButton("notes", "Notes")}
					{tabButton("folders", "Folders")}
					{tabButton("tags", "Tags")}
				</div>

				<div className="chat-picker-search">
					<input
						type="text"
						placeholder="Search..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						autoFocus
					/>
				</div>

				<div className="chat-modal-body chat-picker-body">
					{activeTab === "notes" && (
						<div className="chat-picker-list">
							{filteredNotes.length === 0 ? (
								<div className="chat-modal-empty">
									<p>No notes found.</p>
								</div>
							) : (
								filteredNotes.map((file) => {
									const key = `note:${file.path}`;
									const checked = selectedIds.has(key);
									return (
										<label
											key={key}
											className={`chat-picker-item${checked ? " chat-picker-item-selected" : ""}`}
										>
											<input
												type="checkbox"
												checked={checked}
												onChange={() =>
													toggleSelection(key)
												}
											/>
											<span className="chat-picker-item-name">
												{file.basename}
											</span>
											<span className="chat-picker-item-meta">
												{file.extension}
											</span>
										</label>
									);
								})
							)}
						</div>
					)}

					{activeTab === "folders" && (
						<div className="chat-picker-list">
							{filteredFolders.length === 0 ? (
								<div className="chat-modal-empty">
									<p>No folders found.</p>
								</div>
							) : (
								filteredFolders.map((folder) => {
									const key = `folder:${folder.path}`;
									const checked = selectedIds.has(key);
									const displayName =
										folder.path === ""
											? "(vault root)"
											: folder.name;
									return (
										<label
											key={key}
											className={`chat-picker-item${checked ? " chat-picker-item-selected" : ""}`}
										>
											<input
												type="checkbox"
												checked={checked}
												onChange={() =>
													toggleSelection(key)
												}
											/>
											<span className="chat-picker-item-name">
												{displayName}
											</span>
											<span className="chat-picker-item-meta">
												{folder.path}
											</span>
										</label>
									);
								})
							)}
						</div>
					)}

					{activeTab === "tags" && (
						<div className="chat-picker-list">
							{filteredTags.length === 0 ? (
								<div className="chat-modal-empty">
									<p>No tags found.</p>
								</div>
							) : (
								filteredTags.map(({ tag, count }) => {
									const key = `tag:${tag}`;
									const checked = selectedIds.has(key);
									return (
										<label
											key={key}
											className={`chat-picker-item${checked ? " chat-picker-item-selected" : ""}`}
										>
											<input
												type="checkbox"
												checked={checked}
												onChange={() =>
													toggleSelection(key)
												}
											/>
											<span className="chat-picker-item-name">
												{tag}
											</span>
											<span className="chat-picker-item-meta">
												{count} note
												{count !== 1 ? "s" : ""}
											</span>
										</label>
									);
								})
							)}
						</div>
					)}
				</div>

				<div className="chat-picker-footer">
					<span className="chat-picker-count">
						{selectedIds.size} selected
					</span>
					<button
						className="chat-btn chat-send-btn"
						onClick={handleAdd}
						disabled={selectedIds.size === 0}
					>
						Add to context
					</button>
				</div>
			</div>
		</div>
	);
};

export default ContextPickerModal;
