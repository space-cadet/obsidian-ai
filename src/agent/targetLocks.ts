/** Error returned when a tool call is cancelled while waiting for a target. */
export class ToolLockCancelledError extends Error {
	constructor() {
		super("Tool call cancelled while waiting for another operation.");
		this.name = "ToolLockCancelledError";
	}
}

/**
 * Serializes operations that touch the same vault or memory target.
 * Different targets can still run at the same time.
 */
export class TargetLockManager {
	private readonly tails = new Map<string, Promise<void>>();

	async runExclusive<T>(
		targets: readonly string[],
		operation: () => Promise<T>,
		signal?: AbortSignal,
	): Promise<T> {
		const uniqueTargets = Array.from(
			new Set(targets.filter(Boolean)),
		).sort();
		return this.acquireTargets(uniqueTargets, 0, operation, signal);
	}

	private async acquireTargets<T>(
		targets: readonly string[],
		index: number,
		operation: () => Promise<T>,
		signal?: AbortSignal,
	): Promise<T> {
		if (index >= targets.length) return operation();

		const target = targets[index];
		const previous = this.tails.get(target) ?? Promise.resolve();
		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.tails.set(target, current);

		try {
			await waitForTurn(previous, signal);
			return await this.acquireTargets(
				targets,
				index + 1,
				operation,
				signal,
			);
		} finally {
			release();
			if (this.tails.get(target) === current) this.tails.delete(target);
		}
	}
}

async function waitForTurn(
	previous: Promise<void>,
	signal?: AbortSignal,
): Promise<void> {
	if (!signal) {
		await previous;
		return;
	}
	if (signal.aborted) throw new ToolLockCancelledError();

	await new Promise<void>((resolve, reject) => {
		const onAbort = () => {
			signal.removeEventListener("abort", onAbort);
			reject(new ToolLockCancelledError());
		};
		signal.addEventListener("abort", onAbort, { once: true });
		previous.then(
			() => {
				signal.removeEventListener("abort", onAbort);
				resolve();
			},
			(error) => {
				signal.removeEventListener("abort", onAbort);
				reject(error);
			},
		);
	});
}

function normalizedPath(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	return value.replace(/\\+/g, "/").replace(/^\/+/, "");
}

function notePath(value: unknown): string | null {
	const path = normalizedPath(value);
	if (!path) return null;
	return path.toLowerCase().endsWith(".md") ? path : `${path}.md`;
}

/** Return stable target keys for a validated tool call. */
export function mutationTargets(
	toolName: string,
	args: Record<string, unknown>,
): string[] {
	const noteToolNames = new Set([
		"read_note",
		"edit_note",
		"append_to_note",
		"create_note",
		"patch_note",
		"edit_section",
		"move_note",
		"delete_note",
	]);
	const path = noteToolNames.has(toolName)
		? notePath(args.path)
		: normalizedPath(args.path);
	const targets: string[] = [];
	if (path) targets.push(`vault:${path}`);

	if (toolName === "move_note") {
		const destination = notePath(args.new_path);
		if (destination) targets.push(`vault:${destination}`);
	}
	if (toolName === "create_notes" && Array.isArray(args.notes)) {
		for (const note of args.notes) {
			if (!note || typeof note !== "object") continue;
			const path = notePath((note as Record<string, unknown>).path);
			if (path) targets.push(`vault:${path}`);
		}
	}

	if (targets.length > 0) return targets;
	if (toolName === "update_setting" && typeof args.key === "string") {
		return [`setting:${args.key}`];
	}
	if (
		(toolName === "update_memory" || toolName === "delete_memory") &&
		typeof args.id === "string"
	) {
		return [`memory:${args.id}`];
	}
	if (toolName === "create_memory" && typeof args.category === "string") {
		return [`memory-category:${args.category}`];
	}
	return [`tool:${toolName}`];
}
