import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
	buildHistoryWithTools,
	type HistoryEntry,
} from "../src/lib/historyBuilder";
import {
	buildBudgetedHistory,
	type ContextBudgetOptions,
} from "../src/context/contextBudget";
import { estimateTokens } from "../src/context/tokenEstimator";
import type { ChatMessage, ContentPart } from "../src/types";
import type { ToolCall, ToolResult } from "../src/agent/types";
import { printReport, saveJsonReport } from "./report";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Fixture {
	name: string;
	messages: ChatMessage[];
}

export interface StrategyResult {
	tokens_before: number;
	tokens_after: number;
	savings_percent: number;
	messages_count: number;
	tool_calls_count: number;
}

export interface BenchmarkResult {
	fixture: string;
	strategy: string;
	result: StrategyResult;
}

export type StrategyFn = (fixture: Fixture) => StrategyResult;

// ─── Token Counting ──────────────────────────────────────────────────────────

function countTokens(messages: unknown[]): number {
	return messages.reduce(
		(sum, msg) => sum + estimateTokens(JSON.stringify(msg)),
		0,
	);
}

function countToolCalls(messages: ChatMessage[]): number {
	let count = 0;
	for (const m of messages) {
		if (m.contentParts) {
			count += m.contentParts.filter((p) => p.type === "tool_call").length;
		} else if (m.toolCalls) {
			count += m.toolCalls.length;
		}
	}
	return count;
}

// ─── Strategies ──────────────────────────────────────────────────────────────

const baselineStrategy: StrategyFn = (fixture) => {
	const tokens_before = countTokens(fixture.messages);
	return {
		tokens_before,
		tokens_after: tokens_before,
		savings_percent: 0,
		messages_count: fixture.messages.length,
		tool_calls_count: countToolCalls(fixture.messages),
	};
};

const elideStrategy: StrategyFn = (fixture) => {
	const tokens_before = countTokens(fixture.messages);
	const history = buildHistoryWithTools(fixture.messages, 1000, 2000, "elide");
	const tokens_after = countTokens(history);
	return {
		tokens_before,
		tokens_after,
		savings_percent:
			tokens_before > 0
				? Number((((tokens_before - tokens_after) / tokens_before) * 100).toFixed(2))
				: 0,
		messages_count: history.length,
		tool_calls_count: countToolCalls(fixture.messages),
	};
};

const budgetStrategy: StrategyFn = (fixture) => {
	const tokens_before = countTokens(fixture.messages);
	const budgetResult = buildBudgetedHistory<ChatMessage>({
		systemPrompt: "",
		currentMessage: "",
		history: fixture.messages,
		options: {
			maxRequestTokens: 8000,
			maxMessages: 100,
			preserveRecentMessages: 4,
			responseReserveTokens: 2048,
		},
	});
	const tokens_after = countTokens(budgetResult.history);
	return {
		tokens_before,
		tokens_after,
		savings_percent:
			tokens_before > 0
				? Number((((tokens_before - tokens_after) / tokens_before) * 100).toFixed(2))
				: 0,
		messages_count: budgetResult.history.length,
		tool_calls_count: countToolCalls(fixture.messages),
	};
};

// ─── Fixture Loading ─────────────────────────────────────────────────────────

function loadFixtures(): Fixture[] {
	const fixturesDir = join(__dirname, "fixtures");
	const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
	return files.map((f) => ({
		name: f.replace(".json", ""),
		messages: JSON.parse(readFileSync(join(fixturesDir, f), "utf-8")) as ChatMessage[],
	}));
}

// ─── Fixture Generation ──────────────────────────────────────────────────────

const LOREM_WORDS = [
	"lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing",
	"elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore",
	"et", "dolore", "magna", "aliqua", "ut", "enim", "ad", "minim", "veniam",
	"quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi", "aliquip",
	"ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "in",
	"reprehenderit", "voluptate", "velit", "esse", "cillum", "fugiat",
	"nulla", "pariatur", "excepteur", "sint", "occaecat", "cupidatat",
	"non", "proident", "sunt", "culpa", "qui", "officia", "deserunt",
	"mollit", "anim", "id", "est", "laborum",
];

function loremWords(count: number): string {
	const words: string[] = [];
	for (let i = 0; i < count; i++) {
		words.push(LOREM_WORDS[i % LOREM_WORDS.length]);
	}
	return words.join(" ") + ".";
}

function loremParagraphs(paragraphs: number, wordsPerParagraph: number): string {
	const paras: string[] = [];
	for (let p = 0; p < paragraphs; p++) {
		paras.push(loremWords(wordsPerParagraph));
	}
	return paras.join("\n\n");
}

function makeToolCall(
	toolName: string,
	args: Record<string, unknown>,
	result: ToolResult,
): ContentPart {
	return {
		type: "tool_call",
		call: {
			toolCallId: `tc-${Math.random().toString(36).slice(2, 10)}`,
			toolName,
			args,
		},
		result,
	};
}

function makeUserMessage(id: string, content: string, timestamp: number): ChatMessage {
	return {
		id,
		role: "user",
		content,
		timestamp,
	};
}

function makeAssistantMessage(
	id: string,
	content: string,
	timestamp: number,
	contentParts?: ContentPart[],
): ChatMessage {
	const msg: ChatMessage = {
		id,
		role: "assistant",
		content,
		timestamp,
	};
	if (contentParts && contentParts.length > 0) {
		msg.contentParts = contentParts;
	}
	return msg;
}

function generateCodingSession(): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const baseTime = Date.now() - 30 * 60 * 1000; // 30 minutes ago
	const userQueries = [
		"Can you refactor the parser in notes/grammar.md?",
		"Search for all notes about error handling.",
		"Write a summary of the project structure to notes/summary.md.",
		"What does the read_note tool return?",
		"Help me clean up the duplicate code in notes/utils.md.",
		"List all notes in the vault.",
		"Create a new note for the API design at notes/api-design.md.",
		"How many words are in notes/large-doc.md?",
		"Search for TODO items across all notes.",
		"Read notes/config.md and explain the settings.",
		"Append a changelog entry to notes/history.md.",
		"Find notes that mention 'refactor'.",
		"Edit the introduction in notes/readme.md.",
		"What folders exist under projects/?",
		"Check if notes/deprecated.md still exists.",
	];

	for (let turn = 0; turn < 15; turn++) {
		const t = baseTime + turn * 2 * 60 * 1000;
		messages.push(
			makeUserMessage(`u-${turn}`, userQueries[turn % userQueries.length], t),
		);

		const hasTools = turn % 2 === 0; // 50% have tool calls
		if (hasTools) {
			const tools: ContentPart[] = [];
			const toolName = ["read_note", "search_notes", "write_note"][turn % 3];
			if (toolName === "read_note") {
				tools.push(
					makeToolCall(
						"read_note",
						{ path: `notes/${["grammar", "config", "utils", "readme"][turn % 4]}.md` },
						{ content: loremParagraphs(3 + (turn % 5), 40) },
					),
				);
			} else if (toolName === "search_notes") {
				tools.push(
					makeToolCall(
						"search_notes",
						{ query: "refactor", limit: 20 },
						{
							matches: Array.from({ length: 5 + (turn % 5) }, (_, i) => ({
								path: `notes/note-${i}.md`,
								basename: `note-${i}.md`,
								modified: t - i * 86400000,
								size: 1000 + i * 500,
							})),
						},
					),
				);
			} else {
				tools.push(
					makeToolCall(
						"write_note",
						{ path: `notes/${["summary", "api-design", "history"][turn % 3]}.md` },
						{ success: true },
					),
				);
			}
			messages.push(
				makeAssistantMessage(
					`a-${turn}`,
					`I will ${toolName.replace("_", " ")} for you.`,
					t + 1000,
					tools,
				),
			);
		} else {
			messages.push(
				makeAssistantMessage(
					`a-${turn}`,
					loremParagraphs(1 + (turn % 3), 30),
					t + 1000,
				),
			);
		}
	}
	return messages;
}

function generateResearchSession(): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const baseTime = Date.now() - 20 * 60 * 1000;
	const userQueries = [
		"Research the latest trends in quantum computing.",
		"What does notes/physics-overview.md say about entanglement?",
		"Search the web for recent papers on error correction.",
		"Summarize the findings in notes/research-log.md.",
		"Find web sources about topological quantum computing.",
		"Read notes/bibliography.md and list the key references.",
		"Search for 'anyon braiding' online.",
		"What are the main sections in notes/thesis.md?",
		"Look up recent news about quantum supremacy.",
		"Read the introduction from notes/intro.md.",
	];

	for (let turn = 0; turn < 10; turn++) {
		const t = baseTime + turn * 2 * 60 * 1000;
		messages.push(
			makeUserMessage(`u-${turn}`, userQueries[turn % userQueries.length], t),
		);

		const hasTools = turn % 2 === 0;
		if (hasTools) {
			const tools: ContentPart[] = [];
			const toolName = turn % 4 < 2 ? "web_search" : "read_note";
			if (toolName === "web_search") {
				tools.push(
					makeToolCall(
						"web_search",
						{ query: userQueries[turn].replace(/\.$/, "").split(" ").slice(1).join(" ") },
						{
							content: `Search results:\n${Array.from(
								{ length: 3 + (turn % 4) },
								(_, i) =>
									`${i + 1}. ${loremWords(15)} — https://example.com/result-${turn}-${i}`,
							).join("\n")}`,
						},
					),
				);
			} else {
				tools.push(
					makeToolCall(
						"read_note",
						{
							path: `notes/${["physics-overview", "research-log", "bibliography", "thesis", "intro"][turn % 5]}.md`,
						},
						{ content: loremParagraphs(2 + (turn % 4), 45) },
					),
				);
			}
			messages.push(
				makeAssistantMessage(
					`a-${turn}`,
					`Searching for relevant information.`,
					t + 1000,
					tools,
				),
			);
		} else {
			messages.push(
				makeAssistantMessage(
					`a-${turn}`,
					loremParagraphs(2, 35),
					t + 1000,
				),
			);
		}
	}
	return messages;
}

function generateAttachmentSession(): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const baseTime = Date.now() - 15 * 60 * 1000;
	const userQueries = [
		"Read the full content of notes/large-spec.md.",
		"What does notes/documentation.md contain?",
		"Show me everything in notes/archive.md.",
		"Read notes/dump.md and summarize the key points.",
		"I need the complete text from notes/backup.md.",
		"What is in notes/legacy.md?",
		"Read notes/data-dump.md fully.",
		"Show me notes/reference-manual.md.",
	];

	for (let turn = 0; turn < 8; turn++) {
		const t = baseTime + turn * 2 * 60 * 1000;
		messages.push(
			makeUserMessage(`u-${turn}`, userQueries[turn % userQueries.length], t),
		);

		const tools: ContentPart[] = [];
		// Every assistant turn has a large read_note result
		tools.push(
			makeToolCall(
				"read_note",
				{
					path: `notes/${["large-spec", "documentation", "archive", "dump", "backup", "legacy", "data-dump", "reference-manual"][turn % 8]}.md`,
				},
				{
					content: loremParagraphs(20 + (turn % 5) * 5, 50), // 1000-2000 words = 4000-8000+ chars
				},
			),
		);
		messages.push(
			makeAssistantMessage(
				`a-${turn}`,
				`Here is the full content of the requested note.`,
				t + 1000,
				tools,
			),
		);
	}
	return messages;
}

export function generateFixtures(): void {
	const fixturesDir = join(__dirname, "fixtures");
	mkdirSync(fixturesDir, { recursive: true });

	const fixtures = [
		{ name: "coding-session-30-turns", generator: generateCodingSession },
		{ name: "research-session-20-turns", generator: generateResearchSession },
		{ name: "attachment-session-15-turns", generator: generateAttachmentSession },
	];

	for (const { name, generator } of fixtures) {
		const messages = generator();
		writeFileSync(
			join(fixturesDir, `${name}.json`),
			JSON.stringify(messages, null, 2),
		);
		console.log(`Generated fixture: ${name}.json (${messages.length} messages)`);
	}
}

// ─── Benchmark Runner ────────────────────────────────────────────────────────

function runBenchmark(): BenchmarkResult[] {
	const fixtures = loadFixtures();
	const strategies: Record<string, StrategyFn> = {
		baseline: baselineStrategy,
		elide: elideStrategy,
		budget: budgetStrategy,
	};

	const results: BenchmarkResult[] = [];
	for (const fixture of fixtures) {
		for (const [name, strategy] of Object.entries(strategies)) {
			results.push({
				fixture: fixture.name,
				strategy: name,
				result: strategy(fixture),
			});
		}
	}
	return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
	const args = process.argv.slice(2);
	if (args.includes("--generate-fixtures")) {
		generateFixtures();
		return;
	}

	const results = runBenchmark();
	printReport(results);
	saveJsonReport(results, join(__dirname, "benchmark-report.json"));
}

main();
