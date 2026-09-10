export interface BuiltinCommandReference {
	command: string;
	description: string;
}

/** Commands handled locally by the chat composer rather than sent to a model. */
export const BUILTIN_BANG_COMMANDS: BuiltinCommandReference[] = [
	{
		command: "!help",
		description: "Show this built-in command reference.",
	},
	{
		command: "!debug",
		description: "Show this built-in command reference.",
	},
	{
		command: "!debug help",
		description: "Show this built-in command reference.",
	},
	{
		command: "!debug history",
		description: "Show the model-facing message history.",
	},
	{
		command: "!debug tokens",
		description:
			"Show rough token estimates, request budget, and tool counts.",
	},
	{
		command: "!debug context",
		description:
			"Show context items and attachments on the last user message.",
	},
	{
		command: "!debug compact",
		description:
			"Run compaction now, save the validated summary, and keep the full transcript.",
	},
];

export function formatBuiltinCommandReference(): string {
	return [
		"**Built-in ! Commands**",
		"",
		"These commands run locally and are never sent to the AI model:",
		"",
		"| Command | Description |",
		"|---------|-------------|",
		...BUILTIN_BANG_COMMANDS.map(
			({ command, description }) => `| \`${command}\` | ${description} |`,
		),
		"",
		"`!debug` without a subcommand is an alias for `!debug help`.",
	].join("\n");
}
