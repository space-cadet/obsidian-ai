// src/api/OpenResponsesParser.ts
// SSE event parser for OpenResponses API streaming format

export interface OpenResponsesTextDelta {
	type: "text-delta";
	delta: string;
}

export interface OpenResponsesFunctionCall {
	type: "function_call";
	call_id: string;
	name: string;
	arguments: string; // JSON string, may be partial during streaming
}

export interface OpenResponsesFunctionCallDone {
	type: "function_call_done";
	call_id: string;
	name: string;
	arguments: string; // complete JSON string
}

export interface OpenResponsesFinish {
	type: "finish";
	response_id: string;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	};
}

export interface OpenResponsesError {
	type: "error";
	message: string;
}

export type OpenResponsesEvent =
	| OpenResponsesTextDelta
	| OpenResponsesFunctionCall
	| OpenResponsesFunctionCallDone
	| OpenResponsesFinish
	| OpenResponsesError;

/**
 * Parse a single SSE event line into an OpenResponsesEvent.
 * Returns null for events we don't care about (response.created, etc.)
 * or for the [DONE] terminator.
 */
export function parseSseEvent(
	eventType: string,
	data: string,
): OpenResponsesEvent | null {
	if (data === "[DONE]") return null;

	try {
		const payload = JSON.parse(data);

		switch (eventType) {
			case "response.output_text.delta":
				if (payload.delta) {
					return { type: "text-delta", delta: payload.delta };
				}
				return null;

			case "response.output_item.added": {
				const item = payload.item;
				if (item?.type === "function_call") {
					return {
						type: "function_call",
						call_id:
							item.call_id || item.id || `call_${Date.now()}`,
						name: item.name,
						arguments: item.arguments || "",
					};
				}
				return null;
			}

			case "response.output_item.done": {
				const item = payload.item;
				if (item?.type === "function_call") {
					return {
						type: "function_call_done",
						call_id: item.call_id || item.id,
						name: item.name,
						arguments: item.arguments || "",
					};
				}
				return null;
			}

			case "response.completed":
				return {
					type: "finish",
					response_id: payload.id || payload.response?.id || "",
					usage: payload.usage || payload.response?.usage,
				};

			case "response.failed":
				return {
					type: "error",
					message: payload.error?.message || "Request failed",
				};

			default:
				return null;
		}
	} catch (e) {
		return null;
	}
}

/**
 * Async generator that parses a raw SSE stream (ReadableStream)
 * into structured OpenResponsesEvent objects.
 */
export async function* parseOpenResponsesStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncIterable<OpenResponsesEvent> {
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });

		// Process complete lines from buffer
		let lineEnd: number;
		while ((lineEnd = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, lineEnd).trim();
			buffer = buffer.slice(lineEnd + 1);

			if (!line) continue;

			// Parse SSE format: "event: <type>" or "data: <json>"
			if (line.startsWith("event: ")) {
				const eventType = line.slice(7).trim();
				// Read next line for data
				const dataLineEnd = buffer.indexOf("\n");
				if (dataLineEnd >= 0) {
					const dataLine = buffer.slice(0, dataLineEnd).trim();
					buffer = buffer.slice(dataLineEnd + 1);
					if (dataLine.startsWith("data: ")) {
						const data = dataLine.slice(6).trim();
						const event = parseSseEvent(eventType, data);
						if (event) yield event;
					}
				}
			}
		}
	}

	// Flush remaining buffer
	const remaining = decoder.decode();
	if (remaining) {
		buffer += remaining;
		const lines = buffer
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].startsWith("event: ")) {
				const eventType = lines[i].slice(7).trim();
				if (i + 1 < lines.length && lines[i + 1].startsWith("data: ")) {
					const data = lines[i + 1].slice(6).trim();
					const event = parseSseEvent(eventType, data);
					if (event) yield event;
					i++;
				}
			}
		}
	}
}
