import { describe, it, expect } from "vitest";
import {
	estimateTokens,
	estimateAttachmentTokens,
	estimateContentPartTokens,
	estimateContentPartsTokens,
	TOKEN_ESTIMATE_RATIO,
} from "../tokenEstimator";

describe("estimateTokens", () => {
	it("returns 0 for empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});

	it("estimates ceil(length / 4) for ASCII text", () => {
		expect(estimateTokens("hello")).toBe(
			Math.ceil(5 / TOKEN_ESTIMATE_RATIO),
		);
		expect(estimateTokens("hello world")).toBe(
			Math.ceil(11 / TOKEN_ESTIMATE_RATIO),
		);
	});

	it("handles unicode characters (counts as 1 char each)", () => {
		const unicode = "你好世界"; // 4 chars
		expect(estimateTokens(unicode)).toBe(
			Math.ceil(4 / TOKEN_ESTIMATE_RATIO),
		);
	});

	it("handles long text", () => {
		const long = "a".repeat(1000);
		expect(estimateTokens(long)).toBe(
			Math.ceil(1000 / TOKEN_ESTIMATE_RATIO),
		);
	});
});

describe("estimateAttachmentTokens", () => {
	it("returns 255 for images", () => {
		expect(
			estimateAttachmentTokens({ type: "image", name: "test.png" }),
		).toBe(255);
		expect(
			estimateAttachmentTokens({
				type: "image",
				name: "test.jpg",
				data: "abc",
			}),
		).toBe(255);
	});

	it("estimates PDF from base64 data size", () => {
		const base64 = btoa("x".repeat(4000)); // 4000 chars = ~3000 bytes
		const tokens = estimateAttachmentTokens({
			type: "pdf",
			name: "doc.pdf",
			data: base64,
		});
		// base64Len * 0.75 / 4
		expect(tokens).toBe(
			Math.ceil((base64.length * 0.75) / TOKEN_ESTIMATE_RATIO),
		);
	});

	it("falls back to 500 for PDF without data", () => {
		expect(estimateAttachmentTokens({ type: "pdf", name: "doc.pdf" })).toBe(
			500,
		);
	});

	it("estimates text files from decoded content", () => {
		const text = "hello world";
		const base64 = btoa(text);
		expect(
			estimateAttachmentTokens({
				type: "text",
				name: "file.txt",
				data: base64,
			}),
		).toBe(estimateTokens(text));
	});

	it("uses size-based estimate for large text files", () => {
		// Create a base64 string that decodes to >100KB
		const largeText = "x".repeat(200 * 1024);
		const base64 = btoa(largeText);
		expect(
			estimateAttachmentTokens({
				type: "text",
				name: "large.txt",
				data: base64,
			}),
		).toBe(Math.ceil((base64.length * 0.75) / TOKEN_ESTIMATE_RATIO));
	});

	it("handles binary data that cannot be decoded as text", () => {
		// Invalid base64 chars would throw, but atob handles most binary
		// Use a valid base64 that produces non-UTF8 when decoded
		const binaryBase64 = "////"; // decodes to 0xff 0xff 0xff
		expect(
			estimateAttachmentTokens({
				type: "application/octet-stream",
				name: "file.bin",
				data: binaryBase64,
			}),
		).toBe(Math.ceil((3 * 0.75) / TOKEN_ESTIMATE_RATIO));
	});

	it("estimates from name when no data provided", () => {
		expect(
			estimateAttachmentTokens({ type: "text", name: "file.txt" }),
		).toBe(estimateTokens("file.txt") + 10);
	});
});

describe("estimateContentPartTokens", () => {
	it("estimates text parts", () => {
		expect(estimateContentPartTokens({ type: "text", text: "hello" })).toBe(
			estimateTokens("hello"),
		);
	});

	it("handles content field alias", () => {
		expect(
			estimateContentPartTokens({
				type: "text",
				content: "world",
			} as any),
		).toBe(estimateTokens("world"));
	});

	it("returns 255 for image parts", () => {
		expect(
			estimateContentPartTokens({ type: "image", image: "base64data" }),
		).toBe(255);
	});

	it("estimates file parts from base64 data", () => {
		const base64 = btoa("x".repeat(400));
		expect(
			estimateContentPartTokens({
				type: "file",
				data: base64,
				mimeType: "application/pdf",
			}),
		).toBe(Math.ceil((base64.length * 0.75) / TOKEN_ESTIMATE_RATIO));
	});

	it("returns 0 for unknown types", () => {
		expect(estimateContentPartTokens({ type: "audio" } as any)).toBe(0);
	});
});

describe("estimateContentPartsTokens", () => {
	it("sums tokens for multiple parts", () => {
		const parts = [
			{ type: "text" as const, text: "hello" },
			{ type: "text" as const, text: "world" },
		];
		expect(estimateContentPartsTokens(parts)).toBe(
			estimateTokens("hello") + estimateTokens("world"),
		);
	});

	it("handles mixed text and image parts", () => {
		const parts = [
			{ type: "text" as const, text: "look at this:" },
			{ type: "image" as const, image: "base64" },
		];
		expect(estimateContentPartsTokens(parts)).toBe(
			estimateTokens("look at this:") + 255,
		);
	});

	it("returns 0 for empty array", () => {
		expect(estimateContentPartsTokens([])).toBe(0);
	});
});
