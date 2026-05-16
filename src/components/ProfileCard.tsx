import React, { useState, useCallback, useRef, useEffect } from "react";
import {
	ProviderProfile,
	ProviderType,
	createProviderProfile,
	getDefaultModel,
	getDefaultEndpoint,
	getDefaultProfileName,
	ObsidianAISettings,
} from "../settings";
import { ChatPluginLike } from "../views/ObsidianAIChatView";
import { Notice } from "obsidian";

// ─── Provider metadata ─────────────────────────────────────────────

const PROVIDER_META: Record<
	ProviderType,
	{ label: string; color: string; icon: string }
> = {
	openai: { label: "OpenAI", color: "#10A37F", icon: "O" },
	anthropic: { label: "Anthropic", color: "#D97757", icon: "A" },
	deepseek: { label: "DeepSeek", color: "#4D6BFA", icon: "D" },
	kimi: { label: "Kimi", color: "#FF6B6B", icon: "K" },
	gemini: { label: "Gemini", color: "#8E75B2", icon: "G" },
	openrouter: { label: "OpenRouter", color: "#FF9500", icon: "R" },
	azure: { label: "Azure", color: "#0078D4", icon: "Az" },
	ollama: { label: "Ollama", color: "#FFCC00", icon: "🦙" },
	custom: { label: "Custom", color: "#888888", icon: "C" },
	agent: { label: "Agent", color: "#00D26A", icon: "🤖" },
};

function getProviderMeta(provider: ProviderType) {
	return PROVIDER_META[provider] ?? { label: provider, color: "#888", icon: "?" };
}

function maskKey(key?: string): string {
	if (!key || key.length < 8) return key ? "••••••••" : "Not set";
	return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function validateProfileQuick(profile: ProviderProfile): { ok: boolean; hint?: string } {
	switch (profile.provider) {
		case "openai":
		case "anthropic":
		case "deepseek":
		case "kimi":
		case "gemini":
		case "openrouter":
			return profile.apiKey ? { ok: true } : { ok: false, hint: "API key missing" };
		case "azure":
			return profile.apiKey && profile.azureEndpoint
				? { ok: true }
				: { ok: false, hint: "API key or endpoint missing" };
		case "custom":
			return profile.apiKey && profile.customURL
				? { ok: true }
				: { ok: false, hint: "API key or URL missing" };
		case "agent":
			return profile.endpointUrl ? { ok: true } : { ok: false, hint: "Endpoint missing" };
		case "ollama":
		default:
			return { ok: true };
	}
}

// ─── Types ─────────────────────────────────────────────────────────

export interface ProfileCardProps {
	profile: ProviderProfile;
	isActive: boolean;
	isEditing: boolean;
	onEdit: () => void;
	onSave: (profile: ProviderProfile) => void;
	onCancel: () => void;
	onDelete: () => void;
	onSetDefault: () => void;
	onDuplicate: () => void;
	onTest: () => void;
}

// ─── ProfileEditForm ────────────────────────────────────────────────

function ProfileEditForm({
	profile,
	onSave,
	onCancel,
}: {
	profile: ProviderProfile;
	onSave: (p: ProviderProfile) => void;
	onCancel: () => void;
}) {
	const [draft, setDraft] = useState<ProviderProfile>({ ...profile });
	const [fetching, setFetching] = useState(false);
	const [models, setModels] = useState<string[]>(profile.modelCache?.models ?? []);
	const [modelSearch, setModelSearch] = useState("");
	const [testStatus, setTestStatus] = useState<
		null | { ok: boolean; message: string }
	>(null);

	const updateDraft = useCallback(
		<K extends keyof ProviderProfile>(key: K, value: ProviderProfile[K]) => {
			setDraft((prev) => ({ ...prev, [key]: value, updatedAt: Date.now() }));
		},
		[],
	);

	const handleProviderChange = useCallback(
		(provider: ProviderType) => {
			const name =
				draft.name === getDefaultProfileName(draft.provider)
					? getDefaultProfileName(provider)
					: draft.name;
			setDraft((prev) => ({
				...prev,
				provider,
				model: getDefaultModel(provider),
				name,
				apiKey: provider === "ollama" ? "" : prev.apiKey,
				customURL: "",
				azureEndpoint: "",
				endpointUrl: "",
				modelCache: undefined,
				updatedAt: Date.now(),
			}));
			setModels([]);
		},
		[draft.name, draft.provider],
	);

	const handleFetchModels = useCallback(async () => {
		setFetching(true);
		try {
			// Use the same logic as ChatApiManager.fetchProviderModels
			const { ChatApiManager } = await import("../api");
			// We need access to a ChatApiManager instance or the static method
			// For now, do a simple fetch based on provider
			let url = "";
			let headers: Record<string, string> = {};
			switch (draft.provider) {
				case "openai":
					url = `${draft.customURL?.trim() || "https://api.openai.com/v1"}/models`;
					headers = { Authorization: `Bearer ${draft.apiKey}` };
					break;
				case "ollama":
					url = `${draft.customURL?.trim() || "http://localhost:11434/v1"}/models`;
					break;
				default:
					new Notice("Model fetching not supported for this provider yet.");
					setFetching(false);
					return;
			}
			const res = await fetch(url, { headers });
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			const data = await res.json();
			const fetched = (data.data ?? [])
				.map((m: any) => m.id)
				.filter((id: string) => typeof id === "string");
			setModels(fetched);
			updateDraft("modelCache", { models: fetched, fetchedAt: Date.now() });
			new Notice(`Fetched ${fetched.length} models`, 2000);
		} catch (err: any) {
			new Notice(`Failed to fetch models: ${err.message}`, 4000);
		} finally {
			setFetching(false);
		}
	}, [draft.provider, draft.apiKey, draft.customURL, updateDraft]);

	const handleTest = useCallback(async () => {
		setTestStatus(null);
		const { validateProfile } = await import("../api");
		const error = validateProfile(draft);
		if (error) {
			setTestStatus({ ok: false, message: error });
			return;
		}
		// For non-agent, we can't easily test without a ChatApiManager instance.
		// For agent, we use AgentApiManager.
		if (draft.provider === "agent") {
			try {
				const { AgentApiManager } = await import("../api/AgentApiManager");
				const agentApi = new AgentApiManager(
					{
						id: draft.id,
						name: draft.name,
						provider: "agent",
						model: draft.model,
						endpointUrl: draft.endpointUrl || "",
						agentId: draft.agentId || "main",
						authToken: draft.apiKey,
						sessionKey: draft.sessionKey,
						autoApprove: draft.autoApprove ?? false,
						maxSteps: draft.maxSteps ?? 10,
					},
					null as any, // app not needed for testConnection
				);
				const result = await agentApi.testConnection();
				setTestStatus(result);
			} catch (err: any) {
				setTestStatus({ ok: false, message: err.message });
			}
		} else {
			setTestStatus({
				ok: false,
				message: "Testing requires saving the profile first.",
			});
		}
	}, [draft]);

	const filteredModels = modelSearch.trim()
		? models.filter((m) => m.toLowerCase().includes(modelSearch.trim().toLowerCase()))
		: models;

	const meta = getProviderMeta(draft.provider);

	return (
		<div className="obsidian-ai-profile-edit-form">
			<div className="obsidian-ai-profile-edit-row">
				<label>Name</label>
				<input
					type="text"
					value={draft.name}
					onChange={(e) => updateDraft("name", e.target.value)}
					placeholder={meta.label}
				/>
			</div>

			<div className="obsidian-ai-profile-edit-row">
				<label>Provider</label>
				<select
					value={draft.provider}
					onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
				>
					<option value="openai">OpenAI</option>
					<option value="anthropic">Anthropic</option>
					<option value="deepseek">DeepSeek</option>
					<option value="kimi">Kimi</option>
					<option value="gemini">Gemini</option>
					<option value="openrouter">OpenRouter</option>
					<option value="azure">Azure OpenAI</option>
					<option value="ollama">Ollama</option>
					<option value="custom">Custom/OpenAI-compatible</option>
					<option value="agent">Agent (OpenResponses)</option>
				</select>
			</div>

			<div className="obsidian-ai-profile-edit-row">
				<label>Model</label>
				<div className="obsidian-ai-profile-edit-model">
					<input
						type="text"
						value={draft.model}
						onChange={(e) => updateDraft("model", e.target.value)}
						placeholder={getDefaultModel(draft.provider)}
					/>
					<button
						className="mod-cta"
						onClick={handleFetchModels}
						disabled={fetching}
						type="button"
					>
						{fetching ? "Fetching…" : models.length > 0 ? "Refresh" : "Fetch"}
					</button>
				</div>
				{models.length > 0 && (
					<>
						<input
							type="text"
							placeholder="Search models…"
							value={modelSearch}
							onChange={(e) => setModelSearch(e.target.value)}
							className="obsidian-ai-profile-edit-model-search"
						/>
						<div className="obsidian-ai-profile-edit-model-list">
							{filteredModels.slice(0, 50).map((m) => (
								<div
									key={m}
									className={`obsidian-ai-profile-edit-model-item${
										m === draft.model ? " is-active" : ""
									}`}
									onClick={() => {
										updateDraft("model", m);
										setModelSearch("");
									}}
								>
									{m}
								</div>
							))}
							{filteredModels.length > 50 && (
								<div className="obsidian-ai-profile-edit-model-more">
									…{filteredModels.length - 50} more
								</div>
							)}
						</div>
					</>
				)}
			</div>

			{draft.provider !== "ollama" && (
				<div className="obsidian-ai-profile-edit-row">
					<label>API Key</label>
					<input
						type="password"
						value={draft.apiKey || ""}
						onChange={(e) => updateDraft("apiKey", e.target.value)}
						placeholder={
							draft.provider === "agent" ? "Bearer token…" : "sk-…"
						}
					/>
				</div>
			)}

			<div className="obsidian-ai-profile-edit-row">
				<label>Endpoint</label>
				<input
					type="text"
					value={
						draft.provider === "azure"
							? draft.azureEndpoint || ""
							: draft.provider === "agent"
							? draft.endpointUrl || ""
							: draft.customURL || ""
					}
					onChange={(e) => {
						const v = e.target.value;
						if (draft.provider === "azure") updateDraft("azureEndpoint", v);
						else if (draft.provider === "agent") updateDraft("endpointUrl", v);
						else updateDraft("customURL", v);
					}}
					placeholder={getDefaultEndpoint(draft.provider)}
				/>
			</div>

			{draft.provider === "azure" && (
				<div className="obsidian-ai-profile-edit-row">
					<label>Azure API Version</label>
					<input
						type="text"
						value={draft.azureApiVersion || "2024-02-15-preview"}
						onChange={(e) => updateDraft("azureApiVersion", e.target.value)}
						placeholder="2024-02-15-preview"
					/>
				</div>
			)}

			{draft.provider === "agent" && (
				<>
					<div className="obsidian-ai-profile-edit-row">
						<label>Agent ID</label>
						<input
							type="text"
							value={draft.agentId || "main"}
							onChange={(e) => updateDraft("agentId", e.target.value || "main")}
							placeholder="main"
						/>
					</div>
					<div className="obsidian-ai-profile-edit-row">
						<label>Session Key</label>
						<input
							type="text"
							value={draft.sessionKey || ""}
							onChange={(e) => updateDraft("sessionKey", e.target.value)}
							placeholder="Optional session key"
						/>
					</div>
					<div className="obsidian-ai-profile-edit-row">
						<label className="obsidian-ai-profile-edit-toggle">
							<input
								type="checkbox"
								checked={draft.autoApprove ?? false}
								onChange={(e) => updateDraft("autoApprove", e.target.checked)}
							/>
							Auto-approve tools
						</label>
					</div>
					<div className="obsidian-ai-profile-edit-row">
						<label>Max Steps</label>
						<input
							type="range"
							min={1}
							max={50}
							value={draft.maxSteps ?? 10}
							onChange={(e) => updateDraft("maxSteps", parseInt(e.target.value, 10))}
						/>
						<span className="obsidian-ai-profile-edit-step-value">
							{draft.maxSteps ?? 10}
						</span>
					</div>
					<div className="obsidian-ai-profile-edit-row">
						<button
							type="button"
							onClick={handleTest}
							className="obsidian-ai-profile-edit-test-btn"
						>
							Test Connection
						</button>
						{testStatus && (
							<span
								className={`obsidian-ai-profile-edit-test-status${
									testStatus.ok ? " is-ok" : " is-error"
								}`}
							>
								{testStatus.ok ? "✅" : "❌"} {testStatus.message}
							</span>
						)}
					</div>
				</>
			)}

			<div className="obsidian-ai-profile-edit-actions">
				<button className="mod-cta" onClick={() => onSave(draft)} type="button">
					Save
				</button>
				<button onClick={onCancel} type="button">
					Cancel
				</button>
			</div>
		</div>
	);
}

// ─── ProfileCard ──────────────────────────────────────────────────

export function ProfileCard({
	profile,
	isActive,
	isEditing,
	onEdit,
	onSave,
	onCancel,
	onDelete,
	onSetDefault,
	onDuplicate,
	onTest,
}: ProfileCardProps) {
	const meta = getProviderMeta(profile.provider);
	const auth = validateProfileQuick(profile);

	if (isEditing) {
		return (
			<div className="obsidian-ai-profile-card is-editing">
				<ProfileEditForm profile={profile} onSave={onSave} onCancel={onCancel} />
			</div>
		);
	}

	return (
		<div
			className={`obsidian-ai-profile-card${isActive ? " is-active" : ""}`}
		>
			<div className="obsidian-ai-profile-card-header">
				<div
					className="obsidian-ai-profile-card-icon"
					style={{ backgroundColor: meta.color }}
					title={meta.label}
				>
					{meta.icon}
				</div>
				<div className="obsidian-ai-profile-card-info">
					<div className="obsidian-ai-profile-card-name-row">
						<span className="obsidian-ai-profile-card-name">{profile.name}</span>
						{isActive && (
							<span className="obsidian-ai-profile-card-badge">Default</span>
						)}
					</div>
					<div className="obsidian-ai-profile-card-meta">
						{meta.label} · {profile.model}
					</div>
				</div>
				<div className="obsidian-ai-profile-card-status">
					<div
						className={`obsidian-ai-profile-card-status-dot${
							auth.ok ? " is-ok" : " is-warn"
						}`}
						title={auth.hint || "Ready"}
					/>
				</div>
			</div>

			<div className="obsidian-ai-profile-card-details">
				<div className="obsidian-ai-profile-card-detail">
					<span className="obsidian-ai-profile-card-detail-label">Endpoint</span>
					<span className="obsidian-ai-profile-card-detail-value">
						{profile.provider === "azure"
							? profile.azureEndpoint || getDefaultEndpoint("azure")
							: profile.provider === "agent"
							? profile.endpointUrl || getDefaultEndpoint("agent")
							: profile.customURL || getDefaultEndpoint(profile.provider)}
					</span>
				</div>
				{profile.provider !== "ollama" && (
					<div className="obsidian-ai-profile-card-detail">
						<span className="obsidian-ai-profile-card-detail-label">Key</span>
						<span className="obsidian-ai-profile-card-detail-value">
							{maskKey(profile.apiKey)}
						</span>
					</div>
				)}
			</div>

			<div className="obsidian-ai-profile-card-actions">
				<button
					title="Edit"
					className="obsidian-ai-icon-btn"
					onClick={onEdit}
					type="button"
				>
					✏️
				</button>
				<button
					title="Duplicate"
					className="obsidian-ai-icon-btn"
					onClick={onDuplicate}
					type="button"
				>
					📋
				</button>
				<button
					title="Test connection"
					className="obsidian-ai-icon-btn"
					onClick={onTest}
					type="button"
				>
					🔌
				</button>
				<button
					title="Set as default"
					className={`obsidian-ai-icon-btn${isActive ? " is-active" : ""}`}
					onClick={onSetDefault}
					type="button"
				>
					⭐
				</button>
				<button
					title="Delete"
					className="obsidian-ai-icon-btn is-danger"
					onClick={onDelete}
					type="button"
				>
					🗑️
				</button>
			</div>
		</div>
	);
}

// ─── ProfileList ──────────────────────────────────────────────────

export interface ProfileListProps {
	plugin: ChatPluginLike;
}

export function ProfileList({ plugin }: ProfileListProps) {
	const [profiles, setProfiles] = useState<ProviderProfile[]>(
		plugin.settings.providerProfiles,
	);
	const [activeId, setActiveId] = useState(
		plugin.settings.activeProviderProfileId,
	);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [testingId, setTestingId] = useState<string | null>(null);

	// Sync with plugin settings when they change externally
	useEffect(() => {
		setProfiles(plugin.settings.providerProfiles);
		setActiveId(plugin.settings.activeProviderProfileId);
	}, [plugin.settings.providerProfiles, plugin.settings.activeProviderProfileId]);

	const saveSettings = useCallback(async () => {
		plugin.settings.providerProfiles = profiles;
		plugin.settings.activeProviderProfileId = activeId;
		await plugin.saveSettings();
		plugin.chatapi.updateSettings(plugin.settings);
	}, [plugin, profiles, activeId]);

	const handleAdd = useCallback(() => {
		const profile = createProviderProfile({ name: "New profile" });
		const next = [...profiles, profile];
		setProfiles(next);
		setActiveId(profile.id);
		setEditingId(profile.id);
	}, [profiles]);

	const handleSave = useCallback(
		(updated: ProviderProfile) => {
			const next = profiles.map((p) =>
				p.id === updated.id ? updated : p,
			);
			setProfiles(next);
			setEditingId(null);
			// Auto-save after edit
			plugin.settings.providerProfiles = next;
			plugin.saveSettings().then(() => {
				plugin.chatapi.updateSettings(plugin.settings);
				new Notice("Profile saved", 1800);
			});
		},
		[profiles, plugin],
	);

	const handleDelete = useCallback(
		(id: string) => {
			if (profiles.length <= 1) {
				new Notice("Keep at least one provider profile.", 3000);
				return;
			}
			const next = profiles.filter((p) => p.id !== id);
			setProfiles(next);
			if (activeId === id) {
				setActiveId(next[0].id);
			}
			plugin.settings.providerProfiles = next;
			plugin.settings.activeProviderProfileId =
				activeId === id ? next[0].id : activeId;
			plugin.saveSettings().then(() => {
				plugin.chatapi.updateSettings(plugin.settings);
			});
		},
		[profiles, activeId, plugin],
	);

	const handleSetDefault = useCallback(
		(id: string) => {
			setActiveId(id);
			plugin.settings.activeProviderProfileId = id;
			plugin.saveSettings().then(() => {
				plugin.chatapi.updateSettings(plugin.settings);
			});
		},
		[plugin],
	);

	const handleDuplicate = useCallback(
		(id: string) => {
			const source = profiles.find((p) => p.id === id);
			if (!source) return;
			const dup = createProviderProfile({
				...source,
				name: `${source.name} copy`,
			});
			const next = [...profiles, dup];
			setProfiles(next);
			setActiveId(dup.id);
			plugin.settings.providerProfiles = next;
			plugin.settings.activeProviderProfileId = dup.id;
			plugin.saveSettings().then(() => {
				plugin.chatapi.updateSettings(plugin.settings);
			});
		},
		[profiles, plugin],
	);

	const handleTest = useCallback(
		async (id: string) => {
			setTestingId(id);
			const profile = profiles.find((p) => p.id === id);
			if (!profile) return;

			try {
				if (profile.provider === "agent") {
					const { AgentApiManager } = await import("../api/AgentApiManager");
					const agentApi = new AgentApiManager(
						{
							id: profile.id,
							name: profile.name,
							provider: "agent",
							model: profile.model,
							endpointUrl: profile.endpointUrl || "",
							agentId: profile.agentId || "main",
							authToken: profile.apiKey,
							sessionKey: profile.sessionKey,
							autoApprove: profile.autoApprove ?? false,
							maxSteps: profile.maxSteps ?? 10,
						},
						plugin.app,
					);
					const result = await agentApi.testConnection();
					new Notice(
						result.ok ? `✅ ${result.message}` : `❌ ${result.message}`,
						6000,
					);
				} else {
					// For standard providers, we need to use the ChatApiManager.
					// The existing testApiConnection only tests the *active* profile.
					// We temporarily swap, test, and restore.
					const originalActive = plugin.settings.activeProviderProfileId;
					plugin.settings.activeProviderProfileId = profile.id;
					plugin.chatapi.updateSettings(plugin.settings);
					const result = await plugin.chatapi.testApiConnection();
					// Restore
					plugin.settings.activeProviderProfileId = originalActive;
					plugin.chatapi.updateSettings(plugin.settings);
					new Notice(
						result.ok ? `✅ ${result.message}` : `❌ ${result.message}`,
						6000,
					);
				}
			} catch (err: any) {
				new Notice(`❌ Test failed: ${err.message}`, 6000);
			} finally {
				setTestingId(null);
			}
		},
		[profiles, plugin],
	);

	return (
		<div className="obsidian-ai-profile-list">
			<div className="obsidian-ai-profile-list-header">
				<h3>Provider Profiles</h3>
				<button className="mod-cta" onClick={handleAdd} type="button">
					+ New Profile
				</button>
			</div>
			<div className="obsidian-ai-profile-grid">
				{profiles.map((profile) => (
					<ProfileCard
						key={profile.id}
						profile={profile}
						isActive={profile.id === activeId}
						isEditing={profile.id === editingId}
						onEdit={() => setEditingId(profile.id)}
						onSave={handleSave}
						onCancel={() => setEditingId(null)}
						onDelete={() => handleDelete(profile.id)}
						onSetDefault={() => handleSetDefault(profile.id)}
						onDuplicate={() => handleDuplicate(profile.id)}
						onTest={() => handleTest(profile.id)}
					/>
				))}
			</div>
			{testingId && (
				<div className="obsidian-ai-profile-testing-toast">
					Testing{" "}
					{profiles.find((p) => p.id === testingId)?.name}…
				</div>
			)}
		</div>
	);
}
