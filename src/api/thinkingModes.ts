import type { ProviderProfile } from "../settings";
import type { ThinkingMode } from "../types";

export interface ThinkingModeOption {
	value: ThinkingMode;
	label: string;
	description: string;
}

const labels: Record<ThinkingMode, string> = {
	"provider-default": "Auto",
	none: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Very high",
	max: "Maximum",
	enabled: "On",
};

const descriptions: Record<ThinkingMode, string> = {
	"provider-default": "Let the provider choose its default reasoning level.",
	none: "Disable extra reasoning when this model supports it.",
	minimal: "Use the model's smallest reasoning budget.",
	low: "Use a low reasoning effort.",
	medium: "Use a balanced reasoning effort.",
	high: "Use a high reasoning effort.",
	xhigh: "Use the model's very high reasoning effort.",
	max: "Use the model's maximum reasoning effort.",
	enabled: "Enable the model's reasoning mode.",
};

const makeOptions = (values: ThinkingMode[]): ThinkingModeOption[] =>
	values.map((value) => ({
		value,
		label: labels[value],
		description: descriptions[value],
	}));

const DEFAULT_ONLY = makeOptions(["provider-default"]);

function optionsForFamily(
	provider: string,
	model: string,
): ThinkingModeOption[] {
	const normalized = model.toLowerCase();
	if (provider === "openai" || provider === "codex") {
		if (/^(gpt-5|gpt-6)/.test(normalized)) {
			const values: ThinkingMode[] = ["provider-default"];
			if (/^gpt-(5\.[1-9]|6)/.test(normalized)) values.push("none");
			values.push("minimal", "low", "medium", "high");
			if (/codex-max|gpt-5\.[6-9]|gpt-6/.test(normalized))
				values.push("xhigh");
			return makeOptions(values);
		}
		if (/^o[1-9](?:-|$)/.test(normalized))
			return makeOptions(["provider-default", "low", "medium", "high"]);
		return DEFAULT_ONLY;
	}

	if (provider === "anthropic") {
		if (
			!/^claude-(?:3-7|4|opus-4|sonnet-4|haiku-4-5|opus-5|sonnet-5|fable-5)/.test(
				normalized,
			)
		)
			return DEFAULT_ONLY;
		const values: ThinkingMode[] = [
			"provider-default",
			"none",
			"low",
			"medium",
			"high",
		];
		if (
			/claude-(?:opus|sonnet)-4-6|claude-opus-4-7|claude-(?:opus|sonnet)-5|claude-fable-5/.test(
				normalized,
			)
		)
			values.push("xhigh");
		return makeOptions(values);
	}

	if (provider === "gemini") {
		if (/gemini-3/.test(normalized))
			return makeOptions([
				"provider-default",
				"minimal",
				"low",
				"medium",
				"high",
			]);
		if (/gemini-2\.5/.test(normalized))
			return makeOptions([
				"provider-default",
				"none",
				"low",
				"medium",
				"high",
			]);
		return DEFAULT_ONLY;
	}

	if (provider === "deepseek") {
		if (/deepseek-v3[.-]2(?:-|$)/.test(normalized))
			return makeOptions(["provider-default", "enabled", "none"]);
		if (/deepseek.*v4|v4.*deepseek/.test(normalized))
			return makeOptions([
				"provider-default",
				"none",
				"low",
				"medium",
				"high",
				"xhigh",
				"max",
			]);
		if (/deepseek-(?:reasoner|r1)/.test(normalized))
			return makeOptions(["provider-default", "enabled", "none"]);
		return DEFAULT_ONLY;
	}

	if (provider === "openrouter") {
		const family = normalized.split("/")[0];
		const routedProvider =
			family === "openai"
				? "openai"
				: family === "anthropic"
					? "anthropic"
					: family === "google"
						? "gemini"
						: family === "deepseek"
							? "deepseek"
							: "openrouter-model";
		const routedModel = normalized.slice(normalized.indexOf("/") + 1);
		if (routedProvider !== "openrouter-model")
			return optionsForFamily(routedProvider, routedModel);
		if (/thinking|reasoner|reasoning|\br1\b/.test(normalized))
			return makeOptions([
				"provider-default",
				"none",
				"low",
				"medium",
				"high",
			]);
		return DEFAULT_ONLY;
	}

	return DEFAULT_ONLY;
}

export function getThinkingModeOptions(
	profile: ProviderProfile,
): ThinkingModeOption[] {
	return optionsForFamily(profile.provider, profile.model ?? "");
}

export function getThinkingModeLabel(mode: ThinkingMode): string {
	return labels[mode];
}

export function getThinkingLevelBarCount(mode: ThinkingMode): number {
	switch (mode) {
		case "minimal":
			return 1;
		case "low":
			return 2;
		case "medium":
			return 3;
		case "high":
			return 4;
		case "xhigh":
		case "max":
		case "enabled":
			return 5;
		default:
			return 0;
	}
}

export function getSdkReasoningLevel(
	mode: ThinkingMode,
	profile?: ProviderProfile,
): "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
	if (mode === "provider-default") return undefined;
	if (
		profile?.provider === "deepseek" &&
		/deepseek-v3[.-]2(?:-|$)/i.test(profile.model ?? "") &&
		(mode === "enabled" || mode === "none")
	)
		return undefined;
	if (mode === "enabled") return "high";
	if (mode === "max") return "xhigh";
	return mode;
}
