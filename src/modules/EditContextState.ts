import { StateEffect, StateField } from "@codemirror/state";

import { clearAIEditEffect } from "./AIExtension";

export interface EditContext {
	from: number;
	to: number;
	text: string;
}

export const setEditContextEffect = StateEffect.define<EditContext | null>();

export const editContextState = StateField.define<EditContext | null>({
	create() {
		return null;
	},
	update(value, tr) {
		const effect = tr.effects.find((e) => e.is(setEditContextEffect));
		if (effect) return effect.value;
		if (tr.effects.some((e) => e.is(clearAIEditEffect))) return null;
		return value;
	},
});
