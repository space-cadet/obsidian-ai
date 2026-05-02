import { App, MarkdownView, Notice, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
import { setGeneratedResponseEffect } from "../modules/AIExtension";
import { setSelectionInfoEffect } from "../modules/SelectionState";

/**
 * Connects the chat panel to the existing CodeMirror diff machinery.
 * All methods are static — no instance state needed.
 */
export class NoteEditingBridge {
	/**
	 * Applies an AI response as a diff against the full content of the active note.
	 * Dispatches both the selection-range effect (full doc) and the response effect
	 * in a single transaction so diffDecorationState sees both in tr.state.
	 */
	static applyToActiveNote(
		app: App,
		aiText: string,
		prompt: string,
	): boolean {
		const markdownView =
			app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) {
			new Notice("⚠️ Open a note first to apply changes.");
			return false;
		}

		const editorView = (markdownView.editor as any).cm as EditorView;
		if (!editorView) {
			new Notice("⚠️ Could not access the editor.");
			return false;
		}

		const doc = editorView.state.doc;
		const fullText = doc.sliceString(0, doc.length);

		console.log(
			`[NoteEditingBridge] applyToActiveNote — note: ${markdownView.file?.path}, aiLen: ${aiText.length}`,
		);

		// Dispatch selection (full doc) and generated response together so
		// diffDecorationState.update sees both effects in tr.state.
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

		// Bring the editor into view so the user sees the diff immediately.
		markdownView.leaf.setEphemeralState({ focus: true });
		return true;
	}

	/**
	 * Appends the AI text to the end of the active note without a diff step.
	 * A Notice confirms the action.
	 */
	static async appendToActiveNote(
		app: App,
		aiText: string,
	): Promise<boolean> {
		const file = app.workspace.getActiveFile();
		if (!(file instanceof TFile)) {
			new Notice("⚠️ No active note to append to.");
			return false;
		}

		console.log(
			`[NoteEditingBridge] appendToActiveNote — note: ${file.path}, aiLen: ${aiText.length}`,
		);

		const existing = await app.vault.read(file);
		await app.vault.modify(file, existing + "\n\n" + aiText);
		new Notice(`✓ Appended to ${file.basename}`);
		return true;
	}
}
