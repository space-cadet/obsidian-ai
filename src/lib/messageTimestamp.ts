function isSameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * Show an unambiguous local time today, and retain the calendar date for
 * messages from an earlier day.
 */
export function formatMessageTimestamp(
	timestamp: number,
	now = new Date(),
): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "Unknown time";

	const time = date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});

	if (isSameLocalDay(date, now)) return time;

	const calendarDate = date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	return `${calendarDate} at ${time}`;
}

/** Full timestamp for hover text and assistive technology. */
export function formatMessageTimestampTitle(timestamp: number): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "Unknown message time";

	return date.toLocaleString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}
