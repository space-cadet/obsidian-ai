import { Notice, Setting } from "obsidian";
import ObsidianAIPlugin from "../main";
import { createSection, createSliderWithValue } from "./helpers";
import { NormalizeSessionTagsModal } from "../modals/NormalizeSessionTagsModal";
import { AgentPromptModal } from "../modals/AgentPromptModal";
import { SyncProgressModal } from "../modals/SyncProgressModal";
import { generateSessionTags, normalizeSessionTags } from "../lib/sessionTags";
import { SessionStateOwner } from "../state/SessionStateOwner";
import {
	normalizeMaxParallelChatSessions,
	type ProviderProfile,
} from "../settings";

function canUseProfileForTagging(profile: ProviderProfile): boolean {
	switch (profile.provider) {
		case "ollama":
			return true;
		case "codex":
			return true;
		case "agent":
			return Boolean(profile.endpointUrl?.trim());
		case "custom":
			return Boolean(profile.customURL?.trim());
		case "azure":
			return Boolean(
				profile.apiKey?.trim() && profile.azureEndpoint?.trim(),
			);
		default:
			return Boolean(profile.apiKey?.trim());
	}
}

export function renderChatDefaultsSection(
	containerEl: HTMLElement,
	plugin: ObsidianAIPlugin,
	saveSettings: (options?: {
		refresh?: boolean;
		quiet?: boolean;
	}) => Promise<void>,
): void {
	const sectionEl = createSection(
		containerEl,
		"Chat Defaults",
		"Control what context gets pulled into chat sessions and how much conversation state is retained.",
	);

	new Setting(sectionEl)
		.setName("Context picker path display")
		.setDesc(
			"How to show file paths in the context picker. 'Never' shows filenames only. 'Always' shows the parent folder for every file. 'When duplicates' shows the parent folder only when multiple files share the same name.",
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("never", "Never")
				.addOption("always", "Always")
				.addOption("duplicates", "When duplicates")
				.setValue(plugin.settings.contextPickerPathDisplay)
				.onChange(async (value) => {
					plugin.settings.contextPickerPathDisplay = value as
						| "never"
						| "always"
						| "duplicates";
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Show full request token count")
		.setDesc(
			"When enabled, the token counter shows the complete API request payload (system prompt + conversation history + message). When disabled, it shows only the current message tokens.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.showFullRequestTokens)
				.onChange(async (value) => {
					plugin.settings.showFullRequestTokens = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Press Enter to send")
		.setDesc(
			"When enabled, pressing Enter sends the message and Shift+Enter inserts a new line. When disabled, Enter inserts a new line and you must click the send button.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.pressEnterToSend)
				.onChange(async (value) => {
					plugin.settings.pressEnterToSend = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Include active note")
		.setDesc(
			"Automatically include the active note when chat context is implemented.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.includeActiveNote)
				.onChange(async (value) => {
					plugin.settings.includeActiveNote = value;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Auto-name sessions")
		.setDesc(
			"Generate chat titles automatically once a conversation has enough context.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.autoNameSessions)
				.onChange(async (value) => {
					plugin.settings.autoNameSessions = value;
					await saveSettings();
				});
		});

	const tagProfiles = plugin.settings.providerProfiles.filter(
		canUseProfileForTagging,
	);
	new Setting(sectionEl)
		.setName("Auto-generate session tags")
		.setDesc(
			"Suggest up to 5 tags after the first exchange in each new session. A short excerpt of that chat is sent to the selected provider. Existing sessions are not tagged automatically.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.autoTagSessions)
				.onChange(async (value) => {
					plugin.settings.autoTagSessions = value;
					await saveSettings();
				});
			(toggle.toggleEl as HTMLInputElement).disabled =
				tagProfiles.length === 0;
		});

	if (tagProfiles.length > 0) {
		const selectedProfile = tagProfiles.some(
			(profile) => profile.id === plugin.settings.sessionTaggingProfileId,
		)
			? plugin.settings.sessionTaggingProfileId
			: tagProfiles[0].id;
		plugin.settings.sessionTaggingProfileId = selectedProfile;
		const tagProfileSetting = new Setting(sectionEl)
			.setName("Session tag provider and model")
			.setDesc("");
		tagProfileSetting.addDropdown((dropdown) => {
			for (const profile of tagProfiles) {
				const label = profile.name.trim();
				dropdown.addOption(
					profile.id,
					label.length > 36 ? `${label.slice(0, 33)}…` : label,
				);
			}
			const updateDescription = (profileId: string) => {
				const profile = tagProfiles.find(
					(item) => item.id === profileId,
				);
				tagProfileSetting.descEl.setText(
					profile
						? `${profile.provider} / ${profile.model} · Choose a configured profile for tag suggestions.`
						: "Choose a configured profile for tag suggestions.",
				);
			};
			dropdown.setValue(selectedProfile);
			updateDescription(selectedProfile);
			dropdown.onChange(async (value) => {
				plugin.settings.sessionTaggingProfileId = value;
				updateDescription(value);
				await saveSettings();
			});
		});

		const bulkDescription =
			"Generate tags for saved sessions that do not have tags yet. Existing tags are preserved. A bounded excerpt of each eligible session is sent to the selected provider.";
		const bulkTagSetting = new Setting(sectionEl)
			.setName("Saved-session tags")
			.setDesc(bulkDescription);
		bulkTagSetting.addButton((button) =>
			button.setButtonText("Generate").onClick(async () => {
				const profile = plugin.settings.providerProfiles.find(
					(item) =>
						item.id === plugin.settings.sessionTaggingProfileId,
				);
				if (!profile) {
					new Notice("Choose a session tag provider first.");
					return;
				}

				const abortController = new AbortController();
				const progressModal = new SyncProgressModal(plugin.app, 0, {
					title: "Generating session tags",
					initialStatus: "Preparing saved sessions…",
					initialCurrentFile: "Loading the session index…",
					initialSummary: "0 tagged · 0 skipped · 0 failed",
					showBackgroundButton: false,
					closeCancelsOnProgress: true,
					showGeneratedTags: true,
					onCancel: () => abortController.abort(),
				});
				progressModal.open();
				button.setDisabled(true).setButtonText("Generating…");
				let generated = 0;
				let failed = 0;
				let skipped = 0;
				let completed = 0;
				let total = 0;
				const formatSummary = () =>
					`${generated} tagged · ${skipped} skipped · ${failed} failed`;
				try {
					const owner = (plugin.sessionState ??=
						new SessionStateOwner({
							load: () => plugin.loadChatData(),
							hydrate: (id) =>
								plugin.hydrateSession?.(id) ??
								Promise.resolve([]),
							peek: (id) =>
								plugin.peekSessionMessages?.(id) ??
								Promise.resolve([]),
							save: (data) => plugin.saveChatData(data),
						}));
					const snapshot = await owner.initialize();
					if (abortController.signal.aborted) {
						progressModal.finishWithSummary(
							"Tag generation cancelled",
							"Cancelled before any sessions were processed.",
							formatSummary(),
						);
						return;
					}
					const candidates = snapshot.sessions.filter(
						(session) =>
							(session.messageCount ?? session.messages.length) >
								0 &&
							normalizeSessionTags(session.tags).length === 0 &&
							!session.autoTagPending,
					);
					total = candidates.length;
					progressModal.setTotal(total);
					if (candidates.length === 0) {
						bulkTagSetting.setDesc(
							`${bulkDescription} No untagged saved sessions were found.`,
						);
						progressModal.finishWithSummary(
							"No sessions to tag",
							"No untagged saved sessions were found.",
							formatSummary(),
						);
						new Notice("No untagged saved sessions found.");
						return;
					}

					progressModal.updateStatus(
						`Found ${total} session${total === 1 ? "" : "s"} to tag.`,
					);
					progressModal.addLog(
						"system",
						`Found ${total} eligible session${total === 1 ? "" : "s"}.`,
					);
					for (let index = 0; index < candidates.length; index++) {
						if (abortController.signal.aborted) break;
						const indexed = candidates[index];
						const sessionTitle =
							indexed.title.trim() || "Untitled session";
						progressModal.updateStatus(
							`Processing session ${index + 1} of ${total}…`,
						);
						progressModal.updateCurrentFile(sessionTitle);
						let logIcon = "system";
						let logText = "";
						let isError = false;
						try {
							const session = await owner.ensureLoaded(
								indexed.id,
							);
							if (abortController.signal.aborted) break;
							if (!session?.messages.length) {
								skipped++;
								logIcon = "skip";
								logText = `${sessionTitle}: no messages available`;
							} else {
								const latest = owner
									.getSnapshot()
									.sessions.find(
										(item) => item.id === session.id,
									);
								if (
									!latest ||
									normalizeSessionTags(latest.tags).length > 0
								) {
									skipped++;
									logIcon = "skip";
									logText = `${sessionTitle}: already tagged or unavailable`;
								} else {
									const tags = await generateSessionTags(
										session.messages,
										profile,
										plugin.chatapi,
										abortController.signal,
									);
									if (abortController.signal.aborted) break;
									if (!tags.length) {
										skipped++;
										logIcon = "skip";
										logText = `${sessionTitle}: no tags suggested`;
									} else {
										const current = owner
											.getSnapshot()
											.sessions.find(
												(item) =>
													item.id === session.id,
											);
										if (!current) {
											skipped++;
											logIcon = "skip";
											logText = `${sessionTitle}: session removed`;
										} else {
											owner.updateMetadata(session.id, {
												tags: normalizeSessionTags([
													...(current.tags ?? []),
													...tags,
												]),
												updatedAt: Date.now(),
											});
											progressModal.addGeneratedTags(
												sessionTitle,
												tags,
											);
											generated++;
											logText = `${sessionTitle}: ${tags.join(", ")}`;
										}
									}
								}
							}
						} catch (error) {
							if (
								abortController.signal.aborted ||
								(error instanceof Error &&
									error.name === "AbortError")
							) {
								abortController.abort();
								break;
							}
							failed++;
							plugin.logger?.log(
								"warn",
								`[SessionTags] bulk generation failed for ${indexed.id}: ${String(error)}`,
							);
							logIcon = "error";
							logText = `${sessionTitle}: ${String(error)}`;
							isError = true;
						}
						progressModal.addLog(logIcon, logText, {
							id: indexed.id,
							done: true,
							error: isError,
						});
						completed++;
						progressModal.updateProgress(completed);
						progressModal.updateSummary(formatSummary());
					}
					await owner.flush();
					const summary = formatSummary();
					const wasCancelled =
						abortController.signal.aborted && completed < total;
					progressModal.finishWithSummary(
						wasCancelled
							? "Tag generation cancelled"
							: "Tag generation complete",
						wasCancelled
							? `Cancelled after ${completed} of ${total} sessions. Completed tags have been saved.`
							: `Processed ${completed} of ${total} sessions.`,
						summary,
					);
					bulkTagSetting.setDesc(`${bulkDescription} ${summary}.`);
					new Notice(
						wasCancelled
							? `Session tag generation cancelled: ${summary}.`
							: `Session tag generation complete: ${summary}.`,
					);
				} catch (error) {
					if (abortController.signal.aborted && completed < total) {
						progressModal.finishWithSummary(
							"Tag generation cancelled",
							`Cancelled after ${completed} of ${total} sessions.`,
							formatSummary(),
						);
						new Notice(
							`Session tag generation cancelled: ${formatSummary()}.`,
						);
						return;
					}
					progressModal.finishWithSummary(
						"Tag generation failed",
						String(error),
						formatSummary(),
					);
					bulkTagSetting.setDesc(
						`${bulkDescription} Could not complete generation: ${String(error)}`,
					);
					new Notice(
						`Could not generate session tags: ${String(error)}`,
					);
				} finally {
					button.setDisabled(false).setButtonText("Generate");
				}
			}),
		);
		bulkTagSetting.addButton((button) =>
			button
				.setButtonText("Normalize tags…")
				.onClick(() =>
					new NormalizeSessionTagsModal(plugin.app, plugin).open(),
				),
		);
	} else {
		new Setting(sectionEl)
			.setName("Session tag provider and model")
			.setDesc(
				"Configure a provider profile in Provider Profiles to enable automatic tag suggestions.",
			);

		new Setting(sectionEl)
			.setName("Normalize session tags")
			.setDesc(
				"Review and consolidate existing tag names across saved sessions. Edit canonical names and choose which merges to apply.",
			)
			.addButton((button) =>
				button
					.setButtonText("Normalize tags…")
					.onClick(() =>
						new NormalizeSessionTagsModal(
							plugin.app,
							plugin,
						).open(),
					),
			);
	}

	new Setting(sectionEl)
		.setName("Chat tab title width")
		.setDesc(
			"Allowed range: 120–360 px. Default: 160 px. Wider tabs show more of each title before the tab strip scrolls.",
		)
		.addText((text) => {
			text.setPlaceholder("160")
				.setValue(String(plugin.settings.chatTabTitleWidth))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.chatTabTitleWidth = Number.isFinite(value)
						? Math.min(360, Math.max(120, value))
						: 160;
					text.setValue(String(plugin.settings.chatTabTitleWidth));
					document
						.querySelectorAll<HTMLElement>(".chat-session-tabs")
						.forEach((tabStrip) => {
							tabStrip.style.setProperty(
								"--chat-tab-title-width",
								`${plugin.settings.chatTabTitleWidth}px`,
							);
						});
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Restore chat tabs after reload")
		.setDesc(
			"Reopen saved chat tabs, the active tab, and each tab's scroll position after Obsidian or this plugin reloads. Draft tabs are not restored.",
		)
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.restoreChatTabs)
				.onChange(async (value) => {
					plugin.settings.restoreChatTabs = value;
					await saveSettings();
				});
		});

	const maxParallelChatSessionsSetting = new Setting(sectionEl)
		.setName("Maximum parallel chat sessions")
		.setDesc(
			"Maximum number of chat sessions that can generate replies at once. Additional sends are blocked until a reply finishes or is stopped. Default: 5.",
		);
	createSliderWithValue(maxParallelChatSessionsSetting, {
		value: normalizeMaxParallelChatSessions(
			plugin.settings.maxParallelChatSessions,
		),
		min: 1,
		max: 10,
		step: 1,
		onChange: async (value) => {
			plugin.settings.maxParallelChatSessions =
				normalizeMaxParallelChatSessions(value);
			await saveSettings();
		},
	});

	new Setting(sectionEl)
		.setName("Agent prompt")
		.setDesc(
			"Edit the shared base prompt or view and copy the latest generated system prompt.",
		)
		.addButton((button) =>
			button.setButtonText("View and edit").onClick(() => {
				new AgentPromptModal(plugin.app, plugin, saveSettings).open();
			}),
		);

	const maxSessionsSetting = new Setting(sectionEl)
		.setName("Max sessions in sidebar")
		.setDesc(
			"Number of sessions shown in the sidebar before pagination. Not a hard cap on total sessions.",
		);
	createSliderWithValue(maxSessionsSetting, {
		value: plugin.settings.maxSessionsInSidebar,
		min: 10,
		max: 200,
		step: 10,
		onChange: async (value) => {
			plugin.settings.maxSessionsInSidebar = value;
			await saveSettings();
		},
	});

	new Setting(sectionEl)
		.setName("Max saved conversations")
		.setDesc(
			"Maximum number of chat sessions to keep before older ones are trimmed.",
		)
		.addText((text) => {
			text.setPlaceholder("20")
				.setValue(String(plugin.settings.maxSavedConversations))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxSavedConversations =
						Number.isFinite(value) && value > 0 ? value : 20;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Max context tokens")
		.setDesc("Approximate context budget for note/context loading.")
		.addText((text) => {
			text.setPlaceholder("8000")
				.setValue(String(plugin.settings.maxContextTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxContextTokens =
						Number.isFinite(value) && value > 0 ? value : 8000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Max context messages")
		.setDesc(
			"Maximum previous messages to include in the conversation context. Older messages are silently dropped.",
		)
		.addText((text) => {
			text.setPlaceholder("10")
				.setValue(String(plugin.settings.maxContextMessages))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxContextMessages =
						Number.isFinite(value) && value > 0 ? value : 10;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Model request token budget")
		.setDesc(
			"Maximum estimated tokens sent for the system prompt, conversation history, current message, tools, and response reserve. Recent messages are preserved first. Set to 0 to use the legacy message-count limit only.",
		)
		.addText((text) => {
			text.setPlaceholder("32000")
				.setValue(String(plugin.settings.maxRequestTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxRequestTokens =
						Number.isFinite(value) && value >= 0 ? value : 32000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Recent messages to preserve")
		.setDesc(
			"Number of newest messages retained verbatim when the request budget trims older history.",
		)
		.addText((text) => {
			text.setPlaceholder("4")
				.setValue(String(plugin.settings.preserveRecentMessages))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.preserveRecentMessages =
						Number.isFinite(value) && value > 0 ? value : 4;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Response token reserve")
		.setDesc(
			"Tokens held back for the assistant response and agent tool-loop continuations.",
		)
		.addText((text) => {
			text.setPlaceholder("4096")
				.setValue(String(plugin.settings.requestResponseReserveTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.requestResponseReserveTokens =
						Number.isFinite(value) && value >= 0 ? value : 4096;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Compaction trigger tokens")
		.setDesc(
			"Estimated history size at which old conversation turns are summarized. Set to 0 to disable semantic compaction.",
		)
		.addText((text) => {
			text.setPlaceholder("24000")
				.setValue(String(plugin.settings.compactionTriggerTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.compactionTriggerTokens =
						Number.isFinite(value) && value >= 0 ? value : 24000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Compaction release tokens")
		.setDesc(
			"Estimated history size below which a future compaction may be triggered again. Keep below the trigger threshold.",
		)
		.addText((text) => {
			text.setPlaceholder("16000")
				.setValue(String(plugin.settings.compactionReleaseTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.compactionReleaseTokens =
						Number.isFinite(value) && value >= 0 ? value : 16000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Max tool-result replay tokens")
		.setDesc(
			"Maximum estimated tokens from one tool result replayed to the model. Full results remain in the saved transcript for display and export.",
		)
		.addText((text) => {
			text.setPlaceholder("4000")
				.setValue(String(plugin.settings.maxToolResultTokens))
				.inputEl.addEventListener("blur", async () => {
					const value = Number.parseInt(text.getValue(), 10);
					plugin.settings.maxToolResultTokens =
						Number.isFinite(value) && value > 0 ? value : 4000;
					await saveSettings();
				});
		});

	new Setting(sectionEl)
		.setName("Tool history mode")
		.setDesc(
			"How tool calls and results appear in conversation history. 'Elide' hides payloads to save tokens (default). 'Preserve' keeps full detail for debugging.",
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("elide", "Elide (saves tokens)")
				.addOption("preserve", "Preserve (full detail)")
				.setValue(plugin.settings.toolHistoryMode ?? "elide")
				.onChange(async (value) => {
					plugin.settings.toolHistoryMode = value as
						| "elide"
						| "preserve";
					await saveSettings();
				});
		});
}
