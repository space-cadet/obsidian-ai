import { describe, expect, it } from "vitest";
import {
	formatMessageTimestamp,
	formatMessageTimestampTitle,
} from "../messageTimestamp";

describe("formatMessageTimestamp", () => {
	it("includes an AM or PM suffix for messages from today", () => {
		const message = new Date(2026, 7, 4, 4, 1);
		const now = new Date(2026, 7, 4, 23, 52);

		expect(formatMessageTimestamp(message.getTime(), now)).toBe("4:01 AM");
	});

	it("includes the calendar date for messages from an earlier day", () => {
		const message = new Date(2026, 7, 3, 16, 1);
		const now = new Date(2026, 7, 4, 0, 1);

		expect(formatMessageTimestamp(message.getTime(), now)).toBe(
			"Aug 3, 2026 at 4:01 PM",
		);
	});

	it("provides a detailed hover label", () => {
		const message = new Date(2026, 7, 3, 16, 1);

		expect(formatMessageTimestampTitle(message.getTime())).toBe(
			"Monday, August 3, 2026 at 4:01 PM",
		);
	});
});
