import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../systemPrompt";
import { PersonaLoader } from "../../intelligence/PersonaLoader";
import { SlashCommand } from "../slashCommand";

function createMockPersonaLoader(context: string): PersonaLoader {
	return {
		loadFullContext: async (options?: { maxTokens?: number }) =>
			options?.maxTokens ? `(${options.maxTokens}) ${context}` : context,
	} as unknown as PersonaLoader;
}

function createFailingPersonaLoader(): PersonaLoader {
	return {
		loadFullContext: async () => {
			throw new Error("Persona load failed");
		},
	} as unknown as PersonaLoader;
}

describe("buildSystemPrompt", () => {
	it("returns a base prompt without persona loader", async () => {
		const prompt = await buildSystemPrompt([], null);
		expect(prompt).toContain(
			"You are a helpful assistant integrated into an Obsidian note-taking app.",
		);
		expect(prompt).toContain("[System Context]");
	});

	it("injects persona context when personaLoader succeeds", async () => {
		const persona = "You are a quantum physicist.";
		const loader = createMockPersonaLoader(persona);
		const prompt = await buildSystemPrompt([], loader);
		expect(prompt.startsWith(persona)).toBe(true);
		expect(prompt).toContain(
			"You are a helpful assistant integrated into an Obsidian note-taking app.",
		);
	});

	it("passes identityContextBudget to personaLoader when provided", async () => {
		const persona = "You are a quantum physicist.";
		const loader = createMockPersonaLoader(persona);
		const prompt = await buildSystemPrompt(
			[],
			loader,
			undefined,
			false,
			undefined,
			undefined,
			500,
		);
		expect(prompt.startsWith("(500) You are a quantum physicist.")).toBe(
			true,
		);
	});

	it("gracefully falls back when personaLoader throws", async () => {
		const loader = createFailingPersonaLoader();
		const prompt = await buildSystemPrompt([], loader);
		expect(prompt).toContain(
			"You are a helpful assistant integrated into an Obsidian note-taking app.",
		);
		expect(prompt).not.toContain("quantum physicist");
	});

	it("includes system context with date, time and timezone", async () => {
		const prompt = await buildSystemPrompt([], null);
		expect(prompt).toContain("Current date:");
		expect(prompt).toContain("Current time:");
		expect(prompt).toContain("Timezone:");
		expect(prompt).toContain("Locale:");
	});

	it("does not include tool descriptions when toolsEnabled is false", async () => {
		const prompt = await buildSystemPrompt([], null, undefined, false);
		expect(prompt).not.toContain("read_note");
		expect(prompt).not.toContain("edit_note");
	});

	it("includes tool descriptions when toolsEnabled is true", async () => {
		const prompt = await buildSystemPrompt([], null, undefined, true);
		expect(prompt).toContain("read_note");
		expect(prompt).toContain("edit_note");
		expect(prompt).toContain("create_note");
		expect(prompt).toContain("search_notes");
		expect(prompt).toContain("search_past_sessions");
	});

	it("uses the resolved tool descriptions when they are supplied", async () => {
		const prompt = await buildSystemPrompt(
			[],
			null,
			undefined,
			true,
			undefined,
			[
				{
					id: "provider_status",
					description: "Read the current provider status.",
				},
			],
		);

		expect(prompt).toContain(
			"- provider_status: Read the current provider status.",
		);
		expect(prompt).not.toContain("- read_note:");
	});

	it("includes edit slash command instruction", async () => {
		const slashCmd: SlashCommand = {
			command: "edit",
			target: "My Note",
			prompt: "fix grammar",
		};
		const prompt = await buildSystemPrompt([], null, slashCmd);
		expect(prompt).toContain('edit the note "My Note"');
		expect(prompt).toContain(
			"Return ONLY the complete revised note content",
		);
	});

	it("includes create slash command instruction", async () => {
		const slashCmd: SlashCommand = {
			command: "create",
			target: "New Note",
			prompt: "meeting summary",
		};
		const prompt = await buildSystemPrompt([], null, slashCmd);
		expect(prompt).toContain('create a new note named "New Note"');
	});

	it("includes append slash command instruction", async () => {
		const slashCmd: SlashCommand = {
			command: "append",
			target: "Daily Log",
			prompt: "today I did...",
		};
		const prompt = await buildSystemPrompt([], null, slashCmd);
		expect(prompt).toContain('append to the note "Daily Log"');
	});

	it("includes active note context when contextItems has active-note", async () => {
		const contextItems = [
			{
				type: "active-note" as const,
				id: "active-1",
				path: "Notes/Daily.md",
				name: "Daily.md",
			},
		];
		const prompt = await buildSystemPrompt(contextItems, null);
		expect(prompt).toContain(
			"The active note is included in context. When the user asks you to edit, rewrite, or improve the note, return ONLY the complete revised note content.",
		);
	});

	it("does not include active note context without active-note item", async () => {
		const contextItems = [
			{
				type: "note" as const,
				id: "note-1",
				path: "Notes/Other.md",
				name: "Other.md",
			},
		];
		const prompt = await buildSystemPrompt(contextItems, null);
		expect(prompt).not.toContain("The active note is included in context");
	});

	it("does not include participants section when participants is empty", async () => {
		const prompt = await buildSystemPrompt([], null, undefined, false, []);
		expect(prompt).not.toContain("[Participants]");
	});

	it("includes agents in participants section", async () => {
		const participants = [
			{ name: "Gemini", type: "agent" as const },
			{ name: "Kimi", type: "agent" as const },
		];
		const prompt = await buildSystemPrompt(
			[],
			null,
			undefined,
			false,
			participants,
		);
		expect(prompt).toContain("[Participants]");
		expect(prompt).toContain("AI assistants: Gemini, Kimi");
	});

	it("includes remote users in participants section", async () => {
		const participants = [
			{ name: "Alice", type: "remote" as const },
			{ name: "Bob", type: "remote" as const },
		];
		const prompt = await buildSystemPrompt(
			[],
			null,
			undefined,
			false,
			participants,
		);
		expect(prompt).toContain("[Participants]");
		expect(prompt).toContain("Remote users: Alice, Bob");
	});

	it("includes local user in participants section", async () => {
		const participants = [{ name: "Deepak", type: "local" as const }];
		const prompt = await buildSystemPrompt(
			[],
			null,
			undefined,
			false,
			participants,
		);
		expect(prompt).toContain("[Participants]");
		expect(prompt).toContain("Local user: Deepak");
	});

	it("includes all participant types together", async () => {
		const participants = [
			{ name: "Gemini", type: "agent" as const },
			{ name: "Alice", type: "remote" as const },
			{ name: "Deepak", type: "local" as const },
		];
		const prompt = await buildSystemPrompt(
			[],
			null,
			undefined,
			false,
			participants,
		);
		expect(prompt).toContain("[Participants]");
		expect(prompt).toContain("AI assistants: Gemini");
		expect(prompt).toContain("Remote users: Alice");
		expect(prompt).toContain("Local user: Deepak");
		expect(prompt).toContain(
			"Messages from other participants will be prefixed with their name.",
		);
	});
});
