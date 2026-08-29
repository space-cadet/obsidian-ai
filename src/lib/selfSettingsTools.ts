import type { ObsidianAISettings } from "../settings";

/** Keys that can be updated via the update_setting tool.
 * Supports dot-notation for nested paths, e.g. "intelligence.identityContextBudget".
 */
export const MUTABLE_SETTING_KEYS = [
	// Top-level keys
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
	// Nested intelligence settings
	"intelligence.identityContextBudget",
	"intelligence.enableIntelligence",
	"intelligence.autoSummarize",
	"intelligence.autoSummarizeMinMessages",
	"intelligence.enableMemoryAuditTool",
	// Nested sync settings (T43)
	"syncRelayUrl",
	"syncRoomId",
	"syncUserName",
	// Nested remoteStorage settings
	"remoteStorage.enabled",
	"remoteStorage.autoSync",
	"remoteStorage.syncIntervalMinutes",
	"remoteStorage.syncDirection",
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

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
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

export interface SettingValidationResult {
	ok: true;
	key: MutableSettingKey;
	value: unknown;
	/** Resolved path info for nested assignments */
	path?: {
		parent: Record<string, unknown>;
		key: string;
	};
}

export interface SettingValidationError {
	ok: false;
	error: string;
}

/**
 * Resolve a dot-notation path within the settings object.
 * Returns the parent object and the final key for assignment.
 */
export function resolveSettingPath(
	settings: ObsidianAISettings,
	path: string,
): { parent: Record<string, unknown>; key: string } | null {
	const parts = path.split(".");
	if (parts.length === 1) {
		return { parent: settings as unknown as Record<string, unknown>, key: path };
	}

	let current: unknown = settings;
	for (let i = 0; i < parts.length - 1; i++) {
		if (
			current === null ||
			current === undefined ||
			typeof current !== "object" ||
			Array.isArray(current)
		) {
			return null;
		}
		current = (current as Record<string, unknown>)[parts[i]];
	}

	if (
		current === null ||
		current === undefined ||
		typeof current !== "object" ||
		Array.isArray(current)
	) {
		return null;
	}

	return {
		parent: current as Record<string, unknown>,
		key: parts[parts.length - 1],
	};
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

	// Type validators
	const assertPositiveNumber = (k: string, v: unknown) => {
		if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
			return { ok: false as const, error: `"${k}" must be a positive number.` };
		}
		return { ok: true as const };
	};

	const assertBoolean = (k: string, v: unknown) => {
		if (typeof v !== "boolean") {
			return { ok: false as const, error: `"${k}" must be a boolean.` };
		}
		return { ok: true as const };
	};

	const assertEnum = (k: string, v: unknown, values: string[]) => {
		if (!values.includes(v as string)) {
			return {
				ok: false as const,
				error: `"${k}" must be one of: ${values.join(", ")}.`,
			};
		}
		return { ok: true as const };
	};

	const assertString = (k: string, v: unknown) => {
		if (typeof v !== "string") {
			return { ok: false as const, error: `"${k}" must be a string.` };
		}
		return { ok: true as const };
	};

	// Validation dispatch by key (including dot-notation paths)
	let validation: { ok: boolean; error?: string } = { ok: false, error: `Unhandled key "${key}".` };

	switch (key) {
		// Positive number keys
		case "maxContextMessages":
		case "maxToolResultTokens":
		case "messageHistory":
		case "intelligence.identityContextBudget":
		case "intelligence.autoSummarizeMinMessages":
		case "remoteStorage.syncIntervalMinutes":
			validation = assertPositiveNumber(key, value);
			break;

		// Boolean keys
		case "enableAgentTools":
		case "autoApply":
		case "showFullRequestTokens":
		case "pressEnterToSend":
		case "autoNameSessions":
		case "includeActiveNote":
		case "developerMode":
		case "intelligence.enableIntelligence":
		case "intelligence.autoSummarize":
		case "intelligence.enableMemoryAuditTool":
		case "remoteStorage.enabled":
		case "remoteStorage.autoSync":
			validation = assertBoolean(key, value);
			break;

		// Enum keys
		case "toolHistoryMode":
			validation = assertEnum(key, value, ["elide", "preserve"]);
			break;
		case "remoteStorage.syncDirection":
			validation = assertEnum(key, value, ["both", "upload", "download"]);
			break;

		// String keys
		case "syncRelayUrl":
		case "syncRoomId":
		case "syncUserName":
			validation = assertString(key, value);
			break;
	}

	if (!validation.ok) {
		return { ok: false, error: validation.error! };
	}

	return { ok: true, key: key as MutableSettingKey, value };
}
