import { App, TFile } from "obsidian";

const EMBED_PATTERN = /!?\[\[([^\[\]]+)\]\]/g;

/**
 * Expands `![[Note]]` and `![[Note#Heading]]` inline embeds recursively.
 * - depth: current recursion depth (starts at 0)
 * - maxDepth: hard limit to prevent infinite loops (default 2)
 * - seenPaths: guards against circular references
 */
export async function expandEmbeds(
	content: string,
	app: App,
	depth = 0,
	maxDepth = 2,
	seenPaths = new Set<string>(),
): Promise<string> {
	if (depth >= maxDepth) return content;

	const matches = Array.from(content.matchAll(EMBED_PATTERN));
	if (matches.length === 0) return content;

	let result = content;

	// Process from end to start so string replacements don't shift later indices
	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		const fullMatch = match[0];
		const inner = match[1].trim();

		// Parse file path and optional heading fragment
		const pipeIndex = inner.indexOf("|");
		let linkPart = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : inner;

		const hashIndex = linkPart.indexOf("#");
		const filePath =
			hashIndex >= 0 ? linkPart.slice(0, hashIndex).trim() : linkPart;
		const heading =
			hashIndex >= 0 ? linkPart.slice(hashIndex + 1).trim() : null;

		// Resolve file via Obsidian's link cache
		const file = app.metadataCache.getFirstLinkpathDest(filePath, "");
		if (!file || !(file instanceof TFile)) continue;

		// Circular reference guard
		if (seenPaths.has(file.path)) continue;

		let embedContent: string;
		try {
			embedContent = await app.vault.read(file);
		} catch {
			continue;
		}

		// If heading specified, extract content under that heading
		if (heading) {
			embedContent = extractUnderHeading(embedContent, heading);
		}

		// Recurse into embedded content
		const newSeen = new Set(seenPaths);
		newSeen.add(file.path);
		embedContent = await expandEmbeds(
			embedContent,
			app,
			depth + 1,
			maxDepth,
			newSeen,
		);

		// Inline replace
		const before = result.slice(0, match.index);
		const after = result.slice(match.index! + fullMatch.length);
		result = before + embedContent + after;
	}

	return result;
}

/**
 * Extracts content starting at the specified heading up to (but not including)
 * the next heading of the same or higher level.
 */
function extractUnderHeading(content: string, heading: string): string {
	const lines = content.split("\n");
	const targetText = heading.startsWith("#")
		? heading.replace(/^#+\s*/, "").trim()
		: heading.trim();

	let startIdx = -1;
	let startLevel = 1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = line.match(/^(#{1,6})\s+(.+)$/);
		if (match) {
			const level = match[1].length;
			const text = match[2].trim();
			if (text === targetText) {
				startIdx = i;
				startLevel = level;
				break;
			}
		}
	}

	if (startIdx === -1) return content;

	// Find where this section ends (next heading of same or higher level)
	let endIdx = lines.length;
	for (let i = startIdx + 1; i < lines.length; i++) {
		const line = lines[i];
		const match = line.match(/^(#{1,6})\s+/);
		if (match) {
			const level = match[1].length;
			if (level <= startLevel) {
				endIdx = i;
				break;
			}
		}
	}

	return lines.slice(startIdx, endIdx).join("\n");
}
