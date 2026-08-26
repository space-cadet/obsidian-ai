import type { ObsidianAISettings } from "../settings";

/** Keys that can be updated via the update_setting tool. */
export const MUTABLE_SETTING_KEYS = [
	"maxContextMessages",
	"maxToolResultTokens",
	"enableAgentTools",
	"autoApply",
	"showFullRequestTokens",
	"pressEnterToSend",
	"autoNameSessions",
	"messageHistory",
	"includeActiveNote",
	"toolHistoryMode",
	"developerMode",
] as const;

export type MutableSettingKey = (typeof MUTABLE_SETTING_KEYS)[number];

/** Keys that are never sensitive despite containing similar substrings. */
const NEVER_SENSITIVE_EXACT = new Set([
	"maxcontexttokens",
	"maxrequesttokens",
	"maxtoolresulttokens",
	"requestresponsereservetokens",
	"compactiontriggertokens",
	"compactionreleasetokens",
	"showfullrequesttokens",
	"apikeys", // boolean flag in syncComponents
]);

/** Lowercase fragments that indicate a sensitive field (exact or substring match). */
const SENSITIVE_FRAGMENTS = [
	"apikey",
	"password",
	"secret",
	"secretkey",
	"authtoken",
	"auth_token",
	"authorization",
	"passphrase",
	"sessionkey",
	"token",
];

/** Check if a key (or nested path) is sensitive and should be redacted. */
function isSensitiveKey(key: string): boolean {
	const normalized = key.toLowerCase().replace(/_/g, "");
	if (NEVER_SENSITIVE_EXACT.has(normalized)) return false;
	for (const frag of SENSITIVE_FRAGMENTS) {
		if (normalized === frag || normalized.includes(frag)) return true;
	}
	return false;
}

/**
 * Recursively sanitize settings, redacting sensitive fields.
 * Preserves nested structure for non-sensitive parts.
 */
export function sanitizeSettings(
	settings: ObsidianAISettings,
): Record<string, unknown> {
	return sanitizeValue(settings, "") as Record<string, unknown>;
}

function sanitizeValue(value: unknown, keyPath: string): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		// Redact if the key path contains a sensitive fragment
		const lastKey = keyPath.split(".").pop() ?? "";
		if (isSensitiveKey(lastKey)) {
			return typeof value === "string" ? "[REDACTED]" : null;
		}
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item, index) =>
			sanitizeValue(item, `${keyPath}[${index}]`),
		);
	}

	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(obj)) {
			const newPath = keyPath ? `${keyPath}.${key}` : key;
			// If the key itself is sensitive, redact the entire subtree
			if (isSensitiveKey(key)) {
				result[key] = "[REDACTED]";
			} else {
				result[key] = sanitizeValue(val, newPath);
			}
		}
		return result;
	}

	return value;
}

/** Validation result for an update request. */
export interface SettingValidationResult {
	ok: true;
	key: MutableSettingKey;
	value: unknown;
}

export interface SettingValidationError {
	ok: false;
	error: string;
}

/**
 * Validate a proposed setting update.
 * Returns the validated value or an error string.
 */
export function validateSettingUpdate(
	key: string,
	value: unknown,
): SettingValidationResult | SettingValidationError {
	if (!MUTABLE_SETTING_KEYS.includes(key as MutableSettingKey)) {
		return {
			ok: false,
			error: `Key "${key}" is not in the mutable whitelist. Allowed keys: ${MUTABLE_SETTING_KEYS.join(", ")}.`,
		};
	}

	switch (key) {
		case "maxContextMessages":
		case "maxToolResultTokens":
		case "messageHistory": {
			if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
				return {
					ok: false,
					error: `"${key}" must be a positive number.`,
				};
			}
			return { ok: true, key: key as MutableSettingKey, value };
		}
		case "enableAgentTools":
		case "autoApply":
		case "showFullRequestTokens":
		case "pressEnterToSend":
		case "autoNameSessions":
		case "includeActiveNote":
		case "developerMode": {
			if (typeof value !== "boolean") {
				return {
					ok: false,
					error: `"${key}" must be a boolean.`,
				};
			}
			return { ok: true, key: key as MutableSettingKey, value };
		}
		case "toolHistoryMode": {
			if (value !== "elide" && value !== "preserve") {
				return {
					ok: false,
					error: `"toolHistoryMode" must be either "elide" or "preserve".`,
				};
			}
			return { ok: true, key: key as MutableSettingKey, value };
		}
		default: {
			return {
				ok: false,
				error: `Unhandled key "${key}".`,
			};
		}
	}
}
