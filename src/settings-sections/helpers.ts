import { createElement } from "react";
import { createRoot } from "react-dom/client";

export function createSection(
	containerEl: HTMLElement,
	title: string,
	description?: string,
): HTMLElement {
	const sectionEl = containerEl.createDiv({
		cls: "obsidian-ai-settings-section",
	});
	sectionEl.id = `obsidian-ai-settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
	sectionEl.createEl("h3", { text: title });
	if (description) {
		sectionEl.createEl("p", {
			text: description,
			cls: "obsidian-ai-settings-section-desc",
		});
	}
	return sectionEl;
}

export function getProviderLabel(provider: string): string {
	switch (provider) {
		case "openai":
			return "OpenAI";
		case "anthropic":
			return "Anthropic";
		case "deepseek":
			return "DeepSeek";
		case "kimi":
			return "Kimi";
		case "gemini":
			return "Gemini";
		case "openrouter":
			return "OpenRouter";
		case "azure":
			return "Azure OpenAI";
		case "custom":
			return "Custom endpoint";
		case "agent":
			return "Agent (OpenResponses)";
		default:
			return "OpenAI";
	}
}
