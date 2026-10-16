/** Translate internal names (including dotted integration IDs) at the API boundary. */
export function prepareCodexTools(tools: Record<string, any>, messages: any[]) {
	const names = new Set(Object.keys(tools));
	for (const message of messages) {
		if (!Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (
				(part.type === "tool-call" || part.type === "tool-result") &&
				typeof part.toolName === "string"
			)
				names.add(part.toolName);
		}
	}
	const reserved = new Set(
		[...names].filter((name) => /^[a-zA-Z0-9_-]+$/.test(name)),
	);
	const outgoing = new Map<string, string>();
	const incoming = new Map<string, string>();
	for (const name of names) {
		let alias = name;
		if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
			const base = name.replace(/[^a-zA-Z0-9_-]/g, "_") || "tool";
			alias = base;
			let suffix = 1;
			while (reserved.has(alias)) alias = `${base}_${suffix++}`;
		}
		reserved.add(alias);
		outgoing.set(name, alias);
		incoming.set(alias, name);
	}
	return {
		tools: Object.fromEntries(
			Object.entries(tools).map(([name, definition]) => [
				outgoing.get(name)!,
				definition,
			]),
		),
		messages: messages.map((message) =>
			Array.isArray(message.content)
				? {
						...message,
						content: message.content.map((part: any) =>
							(part.type === "tool-call" ||
								part.type === "tool-result") &&
							outgoing.has(part.toolName)
								? {
										...part,
										toolName: outgoing.get(part.toolName),
									}
								: part,
						),
					}
				: message,
		),
		restoreName: (name: string) => incoming.get(name) ?? name,
	};
}
