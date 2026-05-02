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
			`[NoteEditingBridge] applyToNote — note: ${view.file?.path}, aiLen: ${aiText.length}`,
		);

		editorView.dispatch({
			effects: [
				setSelectionInfoEffect.of({
					from: 0,
					to: doc.length,
					text: fullText,
				}),
				setGeneratedResponseEffect.of({ airesponse: aiText, prompt }),
			],
		});

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
}
