export const MAX_RECENT_MODELS = 10;

export interface RecentModelProfile {
	id: string;
	provider: string;
}

function cleanRecentModels(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	return value.filter((candidate): candidate is string => {
		if (typeof candidate !== "string") return false;
		const normalized = candidate.trim();
		if (!normalized || seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
}

/** Read the canonical recent list for a provider. */
export function getRecentModels(
	recentModels: Record<string, string[]>,
	provider: string,
): string[] {
	return cleanRecentModels(recentModels[provider]).slice(
		0,
		MAX_RECENT_MODELS,
	);
}

/**
 * Convert the original profile-keyed storage to provider-keyed storage.
 * Provider keys are canonical; known profile keys are consumed and removed.
 */
export function migrateRecentModelsToProviders(
	recentModels: Record<string, string[]>,
	profiles: RecentModelProfile[],
): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	const profileIds = new Set(profiles.map((profile) => profile.id));
	const providerKeys = new Set(profiles.map((profile) => profile.provider));

	// Preserve unrelated provider histories and normalize their contents.
	for (const [key, models] of Object.entries(recentModels)) {
		if (!profileIds.has(key) || providerKeys.has(key)) {
			const cleaned = cleanRecentModels(models).slice(
				0,
				MAX_RECENT_MODELS,
			);
			if (cleaned.length > 0) result[key] = cleaned;
		}
	}

	for (const profile of profiles) {
		const existing = result[profile.provider] ?? [];
		const profileHistory = cleanRecentModels(recentModels[profile.id]);
		const merged = [
			...existing,
			...profileHistory.filter((model) => !existing.includes(model)),
		].slice(0, MAX_RECENT_MODELS);
		if (merged.length > 0) result[profile.provider] = merged;
	}

	return result;
}

/** Add a model to the single recent list shared by all profiles of a provider. */
export function rememberRecentModel(
	recentModels: Record<string, string[]>,
	provider: string,
	model: string,
): Record<string, string[]> {
	const normalizedModel = model.trim();
	if (!normalizedModel) return recentModels;

	const existing = getRecentModels(recentModels, provider);
	const next = [
		normalizedModel,
		...existing.filter((candidate) => candidate !== normalizedModel),
	].slice(0, MAX_RECENT_MODELS);
	const current = recentModels[provider];
	if (
		current &&
		current.length === next.length &&
		current.every((candidate, index) => candidate === next[index])
	) {
		return recentModels;
	}

	return { ...recentModels, [provider]: next };
}
