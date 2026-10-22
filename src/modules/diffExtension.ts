// modules/diffExtension.ts
import { EditorState, StateField, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	WidgetType,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import DiffMatchPatch from "diff-match-patch";

import {
	acceptAIEditEffect,
	clearAIEditEffect,
	generatedResponseState,
	setGeneratedResponseEffect,
} from "./AIExtension";
import { editContextState } from "./EditContextState";

/**
 * Widget to display added or removed content.
 * Improves accessibility by using appropriate ARIA attributes.
 */
class ChangeContentWidget extends WidgetType {
	constructor(
		private readonly content: string,
		private readonly type: "added" | "removed",
	) {
		super();
	}

	toDOM(): HTMLElement {
		const wrapper = document.createElement("span");
		wrapper.className = `cm-change-widget cm-change-${this.type}`;
		wrapper.textContent = this.content;

		// Accessibility: Provide ARIA label
		wrapper.setAttribute(
			"aria-label",
			this.type === "added" ? "Added content" : "Removed content",
		);

		// Prevent mouse interactions from stealing focus from the editor
		// which can trigger Obsidian to re-render code blocks. We don't want
		// these inline diff widgets to affect editor selection or focus.
		wrapper.addEventListener("mousedown", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
		wrapper.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
		return wrapper;
	}

	ignoreEvent(): boolean {
		// Ensure events on diff widgets are ignored by the outer editor
		// to avoid focus/selection changes that can trigger re-renders.
		return true;
	}
}

/**
 * Generates a DecorationSet representing the diff between AI response and context,
 * using diff_match_patch with semantic cleanup.
 * @param state - The current editor state.
 * @returns A DecorationSet with the appropriate widgets.
 */
function generateDiffView(state: EditorState): DecorationSet {
	try {
		// Retrieve the AI response and the current context text from the state
		const response = state.field(generatedResponseState);
		const context = state.field(editContextState);

		const aiText: string = response?.airesponse ?? "";
		const contextText: string = context?.text ?? "";

		// Use diff_match_patch instead of diffWords
		const dmp = new DiffMatchPatch();
		let diffs = dmp.diff_main(contextText, aiText);

		// Perform semantic cleanup
		dmp.diff_cleanupSemantic(diffs);

		// Initialize RangeSetBuilder for efficient decoration construction
		const builder = new RangeSetBuilder<Decoration>();
		let currentPos = context?.from ?? 0;

		diffs.forEach(([op, text]) => {
			const length = text.length;

			if (op === DiffMatchPatch.DIFF_INSERT) {
				// AI text added
				const widget = new ChangeContentWidget(text, "added");
				builder.add(
					currentPos,
					currentPos,
					Decoration.widget({ widget, side: 1 }),
				);
			} else if (op === DiffMatchPatch.DIFF_DELETE) {
				// Context text removed
				const widget = new ChangeContentWidget(text, "removed");
				// Attach the widget over the removed range
				builder.add(
					currentPos,
					currentPos + length,
					Decoration.widget({ widget, side: -1 }),
				);
				currentPos += length;
			} else {
				// No change, move currentPos forward
				currentPos += length;
			}
		});

		return builder.finish();
	} catch (error) {
		console.error("Error generating diff view:", error);
		return Decoration.none;
	}
}

/**
 * This function takes the current editor state and the view, and applies the AI-suggested changes.
 *
 * @param state - The current editor state.
 * @param view - The EditorView instance.
 */
function dispatchAIChanges(state: EditorState, view: EditorView): void {
	try {
		// Grab the AI text and selection info (original context)
		const response = state.field(generatedResponseState);
		const context = state.field(editContextState);

		const aiText: string = response?.airesponse ?? "";
		const selectionFrom = context?.from ?? 0;
		const selectionTo = context?.to ?? 0;

		console.log(
			`[diffExtension] dispatchAIChanges — from: ${selectionFrom}, to: ${selectionTo}, insertLen: ${aiText.length}`,
		);

		// Dispatch the transaction to apply the AI changes
		view.dispatch({
			changes: { from: selectionFrom, to: selectionTo, insert: aiText },
		});
		console.log(
			"[diffExtension] dispatchAIChanges — transaction dispatched successfully",
		);
	} catch (error) {
		console.error("[diffExtension] Error applying diff changes:", error);
	}
}

export const diffDecorationState = StateField.define<DecorationSet>({
	create(): DecorationSet {
		return Decoration.none;
	},
	update(decorations: DecorationSet, tr) {
		// Check if we got the AI response effect
		if (tr.effects.some((e) => e.is(setGeneratedResponseEffect))) {
			return generateDiffView(tr.state);
		}

		if (tr.effects.some((e) => e.is(clearAIEditEffect))) {
			return Decoration.none;
		}

		// Retain the existing decorations if no relevant changes
		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field),
});

/**
 * Plugin to apply reviewed note changes when the user accepts them.
 */
const applyDiffPlugin = ViewPlugin.fromClass(
	class {
		update(update: ViewUpdate) {
			// Iterate through all transactions in the update
			for (const transaction of update.transactions) {
				for (const effect of transaction.effects) {
					if (effect.is(acceptAIEditEffect)) {
						console.log(
							"[diffExtension] applyDiffPlugin — acceptAIEditEffect detected, scheduling dispatchAIChanges",
						);
						// Apply the diff changes by dispatching the transaction
						window.setTimeout(() => {
							console.log(
								"[diffExtension] applyDiffPlugin — setTimeout fired, calling dispatchAIChanges",
							);
							dispatchAIChanges(update.state, update.view);
						}, 0);
					}
				}
			}
		}
	},
);

export const diffExtension = [diffDecorationState, applyDiffPlugin];
