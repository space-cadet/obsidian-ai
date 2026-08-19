/**
 * Run an array of operations with a concurrency limit.
 *
 * Items are processed in order, but up to `limit` promises run in parallel.
 * On error, waits for all in-flight promises to settle before re-throwing
 * so no promise is left dangling.
 */
export async function runWithConcurrency<T>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<void>,
): Promise<void> {
	if (limit <= 0) limit = 1;
	if (items.length === 0) return;

	const executing = new Set<Promise<void>>();

	for (const item of items) {
		const p = fn(item).finally(() => executing.delete(p));
		executing.add(p);

		if (executing.size >= limit) {
			try {
				await Promise.race(executing);
			} catch (error) {
				// A cancellation/error must not let the caller disconnect while
				// other already-started operations are still running.
				await Promise.allSettled(executing);
				throw error;
			}
		}
	}

	try {
		await Promise.all(executing);
	} catch (error) {
		await Promise.allSettled(executing);
		throw error;
	}
}
