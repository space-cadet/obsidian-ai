/** Run a collection of async reads without opening every file at once. */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const workerCount = Math.min(items.length, Math.max(1, Math.floor(limit)));
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await mapper(items[index], index);
		}
	};

	await Promise.all(Array.from({ length: workerCount }, worker));
	return results;
}
