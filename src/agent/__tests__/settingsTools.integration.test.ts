import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
	class TFile {
		path = "";
		basename = "";
	}
	return {
		App: class {},
		TFile,
		Notice: class {},
		normalizePath: (path: string) => path.replace(/\\/g, "/"),
	};
});

import { ToolExecutor } from "../ToolExecutor";

function makeSettings(developerMode: boolean) {
	return {
		developerMode,
		apiKey: "top-level-secret",
		maxContextMessages: 10,
		maxToolResultTokens: 4000,
		enableAgentTools: true,
		providerProfiles: [
			{
				id: "profile-1",
				name: "Private profile",
				apiKey: "profile-secret",
				password: "profile-password",
			},
		],
	};
}

function makeApp() {
	let audit = "";
	const file = Object.assign(new (class {})(), {
		path: "Notes/example.md",
		basename: "example",
	});
	const adapter = {
		exists: vi.fn(async () => audit.length > 0),
		read: vi.fn(async () => audit),
		write: vi.fn(async (_path: string, value: string) => {
			audit = value;
		}),
	};
	return {
		app: {
			vault: {
				configDir: ".obsidian",
				adapter,
				getFiles: () => [file],
				getAbstractFileByPath: () => null,
			},
			metadataCache: {
				getFirstLinkpathDest: () => null,
			},
		} as any,
		adapter,
		getAudit: () => audit,
	};
}

describe("T61 settings tools through ToolExecutor", () => {
	it("returns settings without exposing credentials", async () => {
		const fixture = makeApp();
		const executor = new ToolExecutor(
			fixture.app,
			makeSettings(false) as any,
		);

		const result = await executor.execute({
			toolCallId: "read-settings",
			toolName: "read_settings",
			args: {},
		});

		expect(result.success).toBe(true);
		expect(JSON.stringify(result.settings)).not.toContain(
			"top-level-secret",
		);
		expect(JSON.stringify(result.settings)).not.toContain("profile-secret");
		expect(JSON.stringify(result.settings)).not.toContain(
			"profile-password",
		);
		expect(result.settings).toMatchObject({
			developerMode: false,
			maxContextMessages: 10,
			maxToolResultTokens: 4000,
		});
	});

	it("omits update_setting when developer mode is disabled", async () => {
		const fixture = makeApp();
		const executor = new ToolExecutor(
			fixture.app,
			makeSettings(false) as any,
		);

		const result = await executor.execute({
			toolCallId: "update-disabled",
			toolName: "update_setting",
			args: { key: "maxContextMessages", value: 20 },
		});

		expect(result.error).toContain("Unknown or unavailable tool");
	});

	it("updates an allowed setting, saves it, and records an audit entry", async () => {
		const fixture = makeApp();
		const settings = makeSettings(true) as any;
		const saveSettings = vi.fn(async () => undefined);
		const executor = new ToolExecutor(
			fixture.app,
			settings,
			undefined,
			undefined,
			undefined,
			undefined,
			saveSettings,
		);

		const result = await executor.execute({
			toolCallId: "update-enabled",
			toolName: "update_setting",
			args: { key: "maxContextMessages", value: 20 },
		});

		expect(result).toMatchObject({
			success: true,
			key: "maxContextMessages",
			value: 20,
		});
		expect(settings.maxContextMessages).toBe(20);
		expect(saveSettings).toHaveBeenCalledTimes(1);
		expect(fixture.getAudit()).toContain('"operation":"update_setting"');
		expect(fixture.getAudit()).toContain('"key":"maxContextMessages"');
		expect(fixture.getAudit()).toContain('"value":20');
	});

	it("rejects invalid types and immutable keys without saving", async () => {
		const fixture = makeApp();
		const saveSettings = vi.fn(async () => undefined);
		const executor = new ToolExecutor(
			fixture.app,
			makeSettings(true) as any,
			undefined,
			undefined,
			undefined,
			undefined,
			saveSettings,
		);

		const wrongType = await executor.execute({
			toolCallId: "invalid-type",
			toolName: "update_setting",
			args: { key: "enableAgentTools", value: "yes" },
		});
		const immutable = await executor.execute({
			toolCallId: "immutable-key",
			toolName: "update_setting",
			args: { key: "apiKey", value: "new-secret" },
		});

		expect(wrongType.error).toContain("must be a boolean");
		expect(immutable.error).toContain("not in the mutable whitelist");
		expect(saveSettings).not.toHaveBeenCalled();
		expect(fixture.getAudit()).toBe("");
	});
});
