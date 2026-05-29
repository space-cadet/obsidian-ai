import { App, TFile, Platform } from "obsidian";
import type { Attachment } from "../types";

/** Maximum image dimension before resizing (px) */
const MAX_IMAGE_DIMENSION = 1024;

/** Supported image MIME types */
const IMAGE_MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
};

/** Check if a file extension is a supported image type */
function isImageFile(path: string): boolean {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	return ext in IMAGE_MIME_TYPES;
}

/** Check if a file extension is PDF */
function isPdfFile(path: string): boolean {
	return path.toLowerCase().endsWith(".pdf");
}

/** Check if a file extension is markdown */
function isMarkdownFile(path: string): boolean {
	return path.toLowerCase().endsWith(".md");
}

/**
 * Resize an image to fit within maxDimension while maintaining aspect ratio.
 * Uses HTML Canvas API (available in Obsidian's Electron environment).
 */
async function resizeImage(
	dataUrl: string,
	maxDimension: number,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			let { width, height } = img;
			if (width <= maxDimension && height <= maxDimension) {
				resolve(dataUrl); // No resize needed
				return;
			}
			if (width > height) {
				height = Math.round((height * maxDimension) / width);
				width = maxDimension;
			} else {
				width = Math.round((width * maxDimension) / height);
				height = maxDimension;
			}
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Could not get canvas context"));
				return;
			}
			ctx.drawImage(img, 0, 0, width, height);
			resolve(canvas.toDataURL("image/jpeg", 0.85));
		};
		img.onerror = () => reject(new Error("Failed to load image for resizing"));
		img.src = dataUrl;
	});
}

/** Convert ArrayBuffer to base64 data URL */
function arrayBufferToDataUrl(
	buffer: ArrayBuffer,
	mimeType: string,
): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	const base64 = btoa(binary);
	return `data:${mimeType};base64,${base64}`;
}

/** Extract base64 string from data URL */
function extractBase64FromDataUrl(dataUrl: string): string {
	return dataUrl.split(",")[1] ?? "";
}

/** Read a vault file as ArrayBuffer */
async function readFileAsArrayBuffer(
	app: App,
	path: string,
): Promise<ArrayBuffer> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!file || !(file instanceof TFile)) {
		throw new Error(`File not found: ${path}`);
	}
	return app.vault.readBinary(file);
}

/** Read a markdown file as text */
async function readMarkdownFile(app: App, path: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!file || !(file instanceof TFile)) {
		throw new Error(`File not found: ${path}`);
	}
	return app.vault.read(file);
}

/** Convert a File (from file input or drag-and-drop) to an Attachment with inline data. */
export async function createExternalAttachment(file: File): Promise<Attachment> {
	const arrayBuffer = await file.arrayBuffer();
	const base64 = arrayBufferToBase64(arrayBuffer);
	const name = file.name;
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	let type: Attachment["type"] = "file";
	let mimeType = file.type || "application/octet-stream";

	if (ext in IMAGE_MIME_TYPES) {
		type = "image";
		mimeType = IMAGE_MIME_TYPES[ext];
	} else if (ext === "pdf") {
		type = "pdf";
		mimeType = "application/pdf";
	} else if (ext === "md" || ext === "txt") {
		type = "markdown";
		mimeType = "text/plain";
	}

	return {
		id: crypto.randomUUID(),
		type,
		path: name, // original filename as path
		name,
		data: base64,
		mimeType,
	};
}

/** Convert ArrayBuffer to base64 string (no data URL prefix). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Resolve an attachment to AI SDK content parts.
 *
 * Returns an array of content parts compatible with Vercel AI SDK v6:
 * - Markdown → text parts
 * - Image → image parts (base64)
 * - PDF → file parts (supported providers) or text placeholder
 * - External files → use inline data if present, else read from vault
 */
export async function resolveAttachment(
	attachment: Attachment,
	app: App,
	provider: string,
): Promise<
	Array<
		| { type: "text"; text: string }
		| { type: "image"; image: string }
		| { type: "file"; data: string; mimeType: string }
	>
> {
	const { path, name, type, data } = attachment;

	// ─── External file with inline data ───
	if (data) {
		// Image with inline data
		if (type === "image") {
			return [{ type: "image", image: data }];
		}
		// PDF with inline data
		if (type === "pdf") {
			if (provider === "gemini" || provider === "openai" || provider === "anthropic" || provider === "openrouter") {
				return [{ type: "file", data, mimeType: "application/pdf" }];
			}
			return [{ type: "text", text: `[PDF attached: ${name}]\n\nNote: PDF content extraction is not yet supported for ${provider}.` }];
		}
		// Markdown/text with inline data
		if (type === "markdown" || type === "file") {
			try {
				const text = atob(data);
				return [{ type: "text", text: `---\nFile: ${name}\n---\n\n${text}` }];
			} catch {
				return [{ type: "text", text: `[Attached file: ${name}]\n\nNote: Could not decode file content.` }];
			}
		}
	}

	// ─── Markdown (vault file) ───
	if (type === "markdown" || isMarkdownFile(path)) {
		const content = await readMarkdownFile(app, path);
		const header = `---\nFile: ${name}\nPath: ${path}\n---\n\n`;
		return [{ type: "text", text: header + content }];
	}

	// ─── Image (vault file) ───
	if (type === "image" || isImageFile(path)) {
		const ext = path.split(".").pop()?.toLowerCase() ?? "png";
		const mimeType = IMAGE_MIME_TYPES[ext] ?? "image/png";
		const buffer = await readFileAsArrayBuffer(app, path);
		let dataUrl = arrayBufferToDataUrl(buffer, mimeType);

		// Resize if needed (canvas-based)
		try {
			dataUrl = await resizeImage(dataUrl, MAX_IMAGE_DIMENSION);
		} catch (e) {
			console.warn(`[AttachmentEngine] Image resize failed for ${path}:`, e);
		}

		const base64 = extractBase64FromDataUrl(dataUrl);
		return [{ type: "image", image: base64 }];
	}

	// ─── PDF (vault file) ───
	if (type === "pdf" || isPdfFile(path)) {
		const buffer = await readFileAsArrayBuffer(app, path);
		const base64 = arrayBufferToDataUrl(buffer, "application/pdf").split(",")[1] ?? "";

		// Providers with native FilePart support
		if (provider === "gemini" || provider === "openai" || provider === "anthropic" || provider === "openrouter") {
			return [
				{
					type: "file",
					data: base64,
					mimeType: "application/pdf",
				},
			];
		}

		// Other providers: return placeholder text
		return [
			{
				type: "text",
				text: `[PDF attached: ${name}]\n\nNote: PDF content extraction is not yet supported for ${provider}. The PDF is available at: ${path}`,
			},
		];
	}

	// ─── Unknown ───
	return [
		{
			type: "text",
			text: `[Attached file: ${name}]\nPath: ${path}\nType: ${type}\n\nNote: This file type is not directly supported.`,
		},
	];
}

/**
 * Resolve multiple attachments to a flat list of content parts.
 */
export async function resolveAttachments(
	attachments: Attachment[],
	app: App,
	provider: string,
): Promise<
	Array<
		| { type: "text"; text: string }
		| { type: "image"; image: string }
		| { type: "file"; data: string; mimeType: string }
	>
> {
	const parts: Array<
		| { type: "text"; text: string }
		| { type: "image"; image: string }
		| { type: "file"; data: string; mimeType: string }
	> = [];

	for (const att of attachments) {
		try {
			const resolved = await resolveAttachment(att, app, provider);
			parts.push(...resolved);
		} catch (e: any) {
			console.error(`[AttachmentEngine] Failed to resolve ${att.path}:`, e);
			parts.push({
				type: "text",
				text: `⚠️ Failed to load attachment: ${att.name} (${e.message})`,
			});
		}
	}

	return parts;
}

/**
 * Detect attachment type from file path.
 */
export function detectAttachmentType(path: string): Attachment["type"] {
	if (isMarkdownFile(path)) return "markdown";
	if (isImageFile(path)) return "image";
	if (isPdfFile(path)) return "pdf";
	return "markdown"; // Default fallback
}

/**
 * Create an Attachment from a vault file path.
 */
export function createAttachment(path: string): Attachment {
	const name = path.split("/").pop() ?? path;
	return {
		id: crypto.randomUUID(),
		type: detectAttachmentType(path),
		path,
		name,
	};
}
