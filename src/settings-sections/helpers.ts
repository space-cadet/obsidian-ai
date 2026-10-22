import { Setting, setIcon } from "obsidian";
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
	sectionEl.id = `obsidian-ai-settings-${title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")}`;
	sectionEl.createEl("h3", { text: title });
	if (description) {
		sectionEl.createEl("p", {
			text: description,
			cls: "obsidian-ai-settings-section-desc",
		});
	}
	return sectionEl;
}

export function createPasswordInput(
	containerEl: HTMLElement,
	options: {
		value: string;
		placeholder?: string;
		onChange: (value: string) => void | Promise<void>;
	},
): { inputEl: HTMLInputElement; wrapperEl: HTMLElement } {
	const wrapper = containerEl.createDiv({
		cls: "obsidian-ai-password-input-wrapper",
	});

	const input = wrapper.createEl("input", {
		cls: "obsidian-ai-password-input",
		attr: {
			type: "password",
			value: options.value,
			placeholder: options.placeholder || "",
		},
	});

	const toggleBtn = wrapper.createEl("button", {
		cls: "obsidian-ai-password-toggle",
		attr: { type: "button", "aria-label": "Show password" },
	});
	setIcon(toggleBtn, "eye");

	const copyBtn = wrapper.createEl("button", {
		cls: "obsidian-ai-password-copy",
		attr: { type: "button", "aria-label": "Copy to clipboard" },
	});
	setIcon(copyBtn, "copy");

	let isVisible = false;
	toggleBtn.addEventListener("click", () => {
		isVisible = !isVisible;
		input.type = isVisible ? "text" : "password";
		toggleBtn.setAttribute(
			"aria-label",
			isVisible ? "Hide password" : "Show password",
		);
		setIcon(toggleBtn, isVisible ? "eye-off" : "eye");
	});

	copyBtn.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(input.value);
			copyBtn.classList.add("is-copied");
			window.setTimeout(
				() => copyBtn.classList.remove("is-copied"),
				1200,
			);
		} catch {
			// ignore
		}
	});

	input.addEventListener("change", () => {
		void options.onChange(input.value);
	});
	input.addEventListener("blur", () => {
		void options.onChange(input.value);
	});

	return { inputEl: input, wrapperEl: wrapper };
}

export function createSliderWithValue(
	setting: Setting,
	options: {
		value: number;
		min: number;
		max: number;
		step: number;
		onChange: (value: number) => void | Promise<void>;
	},
): void {
	let valueEl: HTMLElement | null = null;

	setting.addSlider((slider) => {
		slider
			.setLimits(options.min, options.max, options.step)
			.setValue(options.value)
			.onChange(async (value) => {
				if (valueEl) valueEl.textContent = String(value);
				await options.onChange(value);
			});
	});

	const controlEl = setting.controlEl;
	valueEl = controlEl.createEl("span", {
		cls: "obsidian-ai-slider-value",
		text: String(options.value),
	});
}

export function getProviderLabel(provider: string): string {
	switch (provider) {
		case "openai":
			return "OpenAI";
		case "codex":
			return "Codex";
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
