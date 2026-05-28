export interface SlashCommand {
	command: "edit" | "create" | "append";
	target: string;
	prompt: string;
}

export function parseSlashCommand(text: string): SlashCommand | null {
	const match = text.match(
		/^\/(edit|create|append)\s+(?:\[\[)?([^\]\n]+?)(?:\]\])?(?:\s+([\s\S]*))?$/i,
	);
	if (!match) return null;
	return {
		command: match[1].toLowerCase() as "edit" | "create" | "append",
		target: match[2].trim(),
		prompt: (match[3] ?? "").trim(),
	};
}
