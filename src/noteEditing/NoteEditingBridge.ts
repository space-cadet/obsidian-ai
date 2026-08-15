import { App, MarkdownView, Notice, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
import { setGeneratedResponseEffect } from "../modules/AIExtension";
import { setSelectionInfoEffect } from "../modules/SelectionState";

/**
 * Connects the chat panel to the existing CodeMirror diff machinery.
 * Callers are responsible for resolving the target view/file — no leaf
 * discovery happens here, so the correct note is always targeted.
 */
export class NoteEditingBridge {
	/**
	 * Applies an AI response as a diff against the full content of the given note.
	 * Dispatches both the selection-range effect (full doc) and the response effect
	 * in a single transaction so diffDecorationState sees both in tr.state.
	 */
	static applyToNote(
		app: App,
		view: MarkdownView,
		aiText: string,
		prompt: string,
	): boolean {
		const editorView = (view.editor as any).cm as EditorView;
		if (!editorView) {
			new Notice("⚠️ Could not access the editor.");
			return false;
		}

		const doc = editorView.state.doc;
		const fullText = doc.sliceString(0, doc.length);

		console.log(
			`[NoteEditingBridge] applyToNote — note: ${view.file?.path}, aiLen: ${aiText.length}, docLen: ${fullText.length}`,
		);

		try {
			editorView.dispatch({
				effects: [
					setSelectionInfoEffect.of({
						from: 0,
						to: doc.length,
						text: fullText,
					}),
					setGeneratedResponseEffect.of({
						airesponse: aiText,
						prompt,
					}),
				],
			});
			console.log(
				"[NoteEditingBridge] applyToNote — effects dispatched successfully",
			);
		} catch (e: any) {
			console.error(
				"[NoteEditingBridge] applyToNote — dispatch failed:",
				e,
			);
			return false;
		}

		view.leaf.setEphemeralState({ focus: true });
		return true;
	}

	/**
	 * Appends the AI text to the end of the given file without a diff step.
	 * A Notice confirms the action.
	 */
	static async appendToNote(
		app: App,
		file: TFile,
		aiText: string,
	): Promise<boolean> {
		console.log(
			`[NoteEditingBridge] appendToNote — note: ${file.path}, aiLen: ${aiText.length}`,
		);

		const existing = await app.vault.read(file);
		await app.vault.modify(file, existing + "\n\n" + aiText);
		new Notice(`✓ Appended to ${file.basename}`);
		return true;
	}

	/**
	 * Inserts the AI text at the current cursor position in the given note.
	 * A Notice confirms the action.
	 */
	static insertAtCursor(
		app: App,
		view: MarkdownView,
		aiText: string,
	): boolean {
		const editor = view.editor;
		if (!editor) {
			new Notice("⚠️ Could not access the editor.");
			return false;
		}

		console.log(
			`[NoteEditingBridge] insertAtCursor — note: ${view.file?.path}, aiLen: ${aiText.length}`,
		);

		const cursor = editor.getCursor();
		editor.replaceRange(aiText, cursor);
		new Notice(`✓ Inserted at cursor`);
		return true;
	}

	/**
	 * Opens the target note and applies the AI response as a diff.
	 * Resolves the note path via Obsidian's link cache if needed.
	 */
	static async applyToTargetNote(
		app: App,
		notePath: string,
		aiText: string,
		prompt: string,
	): Promise<boolean> {
		console.log(
			`[NoteEditingBridge] applyToTargetNote — path: ${notePath}, aiLen: ${aiText.length}`,
		);

		// Resolve file
		let file = app.vault.getAbstractFileByPath(notePath);
		if (!file || !(file instanceof TFile)) {
			const resolved = app.metadataCache.getFirstLinkpathDest(
				notePath,
				"",
			);
			if (resolved && resolved instanceof TFile) {
				file = resolved;
			}
		}

		if (!file || !(file instanceof TFile)) {
			console.error(
				`[NoteEditingBridge] applyToTargetNote — note not found: ${notePath}`,
			);
			new Notice(`⚠️ Note not found: ${notePath}`);
			return false;
		}
		console.log(
			`[NoteEditingBridge] applyToTargetNote — resolved to: ${file.path}`,
		);

		// Open the note
		try {
			await app.workspace.openLinkText(file.path, "", false);
			console.log(
				"[NoteEditingBridge] applyToTargetNote — openLinkText done",
			);
		} catch (e: any) {
			console.error(
				"[NoteEditingBridge] applyToTargetNote — openLinkText failed:",
				e,
			);
			return false;
		}

		// Find the leaf
		const leaf = app.workspace
			.getLeavesOfType("markdown")
			.find(
				(l) =>
					l.view instanceof MarkdownView &&
					l.view.file?.path === file.path,
			);

		if (!leaf || !(leaf.view instanceof MarkdownView)) {
			console.error(
				`[NoteEditingBridge] applyToTargetNote — could not find editor leaf for: ${file.path}`,
			);
			new Notice(`⚠️ Could not open editor for: ${notePath}`);
			return false;
		}
		console.log(
			"[NoteEditingBridge] applyToTargetNote — found leaf, calling applyToNote",
		);

		const result = NoteEditingBridge.applyToNote(
			app,
			leaf.view,
			aiText,
			prompt,
		);
		console.log(
			`[NoteEditingBridge] applyToTargetNote — applyToNote returned: ${result}`,
		);
		return result;
	}

	/**
	 * Creates a new note with the given name, opens it, and applies the AI
	 * response as a diff (so the user sees Accept/Discard).
	 */
	static async createNote(
		app: App,
		noteName: string,
		aiContent: string,
		prompt: string,
	): Promise<boolean> {
		// Normalize name to end with .md
		const fileName = noteName.endsWith(".md") ? noteName : `${noteName}.md`;

		// Check if file exists
		let existing = app.vault.getAbstractFileByPath(fileName);
		if (!existing) {
			const resolved = app.metadataCache.getFirstLinkpathDest(
				fileName,
				"",
			);
			if (resolved && resolved instanceof TFile) {
				existing = resolved;
			}
		}

		if (existing) {
			new Notice(`⚠️ Note already exists: ${fileName}`);
			return false;
		}

		// Create file
		let newFile: TFile;
		try {
			newFile = await app.vault.create(fileName, "");
		} catch (e: any) {
			new Notice(`⚠️ Could not create note: ${e.message}`);
			return false;
		}

		// Open in new tab
		await app.workspace.openLinkText(newFile.path, "", true);

		// Find the leaf
		const leaf = app.workspace
			.getLeavesOfType("markdown")
			.find(
				(l) =>
					l.view instanceof MarkdownView &&
					l.view.file?.path === newFile.path,
			);

		if (!leaf || !(leaf.view instanceof MarkdownView)) {
			new Notice(`⚠️ Could not open editor for: ${fileName}`);
			return false;
		}

		// Apply diff (full content as "added")
		return NoteEditingBridge.applyToNote(app, leaf.view, aiContent, prompt);
	}
}
