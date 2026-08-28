import { writeFileSync } from "fs";
import type {
	BenchmarkResult,
	StrategyResult,
	LiveResult,
} from "./context-benchmark";

interface ReportMatrix {
	fixtures: string[];
	strategies: string[];
	data: Record<string, Record<string, StrategyResult>>;
}

function buildMatrix(results: BenchmarkResult[]): ReportMatrix {
	const fixtures = [...new Set(results.map((r) => r.fixture))];
	const strategies = [...new Set(results.map((r) => r.strategy))];
	const data: Record<string, Record<string, StrategyResult>> = {};

	for (const r of results) {
		if (!data[r.fixture]) data[r.fixture] = {};
		data[r.fixture][r.strategy] = r.result;
	}

	return { fixtures, strategies, data };
}

function pad(str: string, width: number): string {
	return str.padEnd(width).slice(0, width);
}

function formatNumber(n: number, width = 10): string {
	const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
	return s.padStart(width);
}

function formatPercent(n: number, width = 10): string {
	return `${n.toFixed(1)}%`.padStart(width);
}

export function printReport(results: BenchmarkResult[]): void {
	const { fixtures, strategies, data } = buildMatrix(results);

	console.log(
		"\n╔══════════════════════════════════════════════════════════════════════════════╗",
	);
	console.log(
		"║           Context Optimization Benchmark Harness — Level 1 Report            ║",
	);
	console.log(
		"╚══════════════════════════════════════════════════════════════════════════════╝\n",
	);

	// Per-fixture detail tables
	for (const fixture of fixtures) {
		console.log(`\n📁 Fixture: ${fixture}`);
		console.log("─".repeat(80));

		const header = `${pad("Strategy", 12)} | ${pad("Before", 10)} | ${pad("After", 10)} | ${pad("Savings", 10)} | ${pad("Messages", 10)} | ${pad("Tool Calls", 10)}`;
		console.log(header);
		console.log("─".repeat(80));

		let bestSavings = -Infinity;
		let bestStrategy = "";

		for (const strategy of strategies) {
			const r = data[fixture][strategy];
			if (!r) continue;
			console.log(
				`${pad(strategy, 12)} | ${formatNumber(r.tokens_before)} | ${formatNumber(r.tokens_after)} | ${formatPercent(r.savings_percent)} | ${formatNumber(r.messages_count)} | ${formatNumber(r.tool_calls_count)}`,
			);
			if (r.savings_percent > bestSavings) {
				bestSavings = r.savings_percent;
				bestStrategy = strategy;
			}
		}

		console.log("─".repeat(80));
		console.log(
			`🏆 Best strategy for ${fixture}: ${bestStrategy} (${bestSavings.toFixed(1)}% savings)\n`,
		);
	}

	// Summary matrix
	console.log("\n📊 Summary Matrix (tokens_after per strategy × fixture)");
	console.log("═".repeat(80));

	const colWidth = Math.max(18, ...fixtures.map((f) => f.length + 2));
	let matrixHeader = pad("Strategy \\ Fixture", 20);
	for (const fixture of fixtures) {
		matrixHeader += ` | ${pad(fixture, colWidth)}`;
	}
	console.log(matrixHeader);
	console.log("═".repeat(80));

	for (const strategy of strategies) {
		let row = pad(strategy, 20);
		for (const fixture of fixtures) {
			const r = data[fixture][strategy];
			row += ` | ${pad(r ? String(r.tokens_after) : "N/A", colWidth)}`;
		}
		console.log(row);
	}

	console.log("\n");
}

export interface JsonReport {
	generatedAt: string;
	level: number;
	results: BenchmarkResult[];
	summary: {
		fixture: string;
		bestStrategy: string;
		bestSavingsPercent: number;
	}[];
}

export function printLiveReport(results: LiveResult[]): void {
	console.log(
		"\n╔══════════════════════════════════════════════════════════════════════════════╗",
	);
	console.log(
		"║              LIVE Benchmark — Estimated vs Actual Token Usage                ║",
	);
	console.log(
		"╚══════════════════════════════════════════════════════════════════════════════╝\n",
	);

	const header = `${pad("Fixture", 28)} | ${pad("Strategy", 10)} | ${pad("Est.", 8)} | ${pad("Actual", 8)} | ${pad("Δ%", 8)} | ${pad("Model", 12)}`;
	console.log(header);
	console.log("─".repeat(90));

	for (const r of results) {
		console.log(
			`${pad(r.fixture.slice(0, 26), 28)} | ${pad(r.strategy, 10)} | ${formatNumber(r.estimated_tokens, 8)} | ${formatNumber(r.actual_prompt_tokens, 8)} | ${formatNumber(r.delta_percent, 8)}% | ${pad(r.model.slice(0, 10), 12)}`,
		);
	}

	console.log("─".repeat(90));

	// Summary stats
	if (results.length > 0) {
		const avgDelta =
			results.reduce((s, r) => s + r.delta_percent, 0) / results.length;
		const minDelta = Math.min(...results.map((r) => r.delta_percent));
		const maxDelta = Math.max(...results.map((r) => r.delta_percent));
		console.log(
			`\n📊 Delta summary: avg=${avgDelta.toFixed(1)}%, min=${minDelta}%, max=${maxDelta}%`,
		);
		console.log(
			`   Negative delta = our estimate was higher than actual (over-estimating)`,
		);
		console.log(
			`   Positive delta = our estimate was lower than actual (under-estimating)`,
		);
	}

	console.log("");
}

export function saveJsonReport(results: BenchmarkResult[], path: string): void {
	const { fixtures, data } = buildMatrix(results);
	const summary = fixtures.map((fixture) => {
		let bestSavings = -Infinity;
		let bestStrategy = "";
		for (const [strategy, result] of Object.entries(data[fixture])) {
			if (result.savings_percent > bestSavings) {
				bestSavings = result.savings_percent;
				bestStrategy = strategy;
			}
		}
		return {
			fixture,
			bestStrategy,
			bestSavingsPercent: Number(bestSavings.toFixed(2)),
		};
	});

	const report: JsonReport = {
		generatedAt: new Date().toISOString(),
		level: 1,
		results,
		summary,
	};

	writeFileSync(path, JSON.stringify(report, null, 2));
	console.log(`📄 JSON report saved to: ${path}`);
}
