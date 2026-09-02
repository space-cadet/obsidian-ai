import type { ProviderProfile } from "../settings";

/** Resolve the profile as configured for one chat session without mutating credentials. */
export function resolveSessionProfile(
	profile: ProviderProfile,
	modelOverrides?: Record<string, string>,
): ProviderProfile {
	const model = modelOverrides?.[profile.id];
	return model && model !== profile.model ? { ...profile, model } : profile;
}
