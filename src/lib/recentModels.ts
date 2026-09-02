export const MAX_RECENT_MODELS = 10;

/** Add a model to a profile's recent list, preserving the legacy provider fallback. */
export function rememberRecentModel(
	recentModels: Record<string, string[]>,
	profileId: string,
	provider: string,
	model: string,
): Record<string, string[]> {
	const normalizedModel = model.trim();
	if (!normalizedModel) return recentModels;

	const existing = recentModels[profileId] ?? recentModels[provider] ?? [];
	const next = [
		normalizedModel,
		...existing.filter(
			(candidate) =>
				typeof candidate === "string" &&
				candidate.trim() &&
				candidate !== normalizedModel,
		),
	].slice(0, MAX_RECENT_MODELS);
	const current = recentModels[profileId];
	if (
		current &&
		current.length === next.length &&
		current.every((candidate, index) => candidate === next[index])
	) {
		return recentModels;
	}

	return { ...recentModels, [profileId]: next };
}
