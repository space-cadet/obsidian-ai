import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatUI } from "./useChatUI";

describe("useChatUI", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});

	describe("modal visibility", () => {
		it("starts with all modals closed", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.showSessionPicker).toBe(false);
			expect(result.current.showExportModal).toBe(false);
			expect(result.current.showContextPicker).toBe(false);
		});

		it("opens and closes session picker", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.openSessionPicker());
			expect(result.current.showSessionPicker).toBe(true);
			act(() => result.current.closeSessionPicker());
			expect(result.current.showSessionPicker).toBe(false);
		});

		it("opens and closes export modal", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.openExportModal());
			expect(result.current.showExportModal).toBe(true);
			act(() => result.current.closeExportModal());
			expect(result.current.showExportModal).toBe(false);
		});

		it("opens and closes context picker", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.openContextPicker());
			expect(result.current.showContextPicker).toBe(true);
			act(() => result.current.closeContextPicker());
			expect(result.current.showContextPicker).toBe(false);
		});
	});

	describe("zen mode", () => {
		it("starts disabled", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.zenMode).toBe(false);
		});

		it("toggles zen mode", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleZenMode());
			expect(result.current.zenMode).toBe(true);
			act(() => result.current.toggleZenMode());
			expect(result.current.zenMode).toBe(false);
		});
	});

	describe("debate mode", () => {
		it("starts disabled", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.debateMode).toBe(false);
		});

		it("toggles debate mode", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleDebateMode());
			expect(result.current.debateMode).toBe(true);
			act(() => result.current.toggleDebateMode());
			expect(result.current.debateMode).toBe(false);
		});
	});

	describe("thinking display", () => {
		it("starts disabled", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.showThinking).toBe(false);
		});

		it("toggles thinking display", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleShowThinking());
			expect(result.current.showThinking).toBe(true);
			act(() => result.current.toggleShowThinking());
			expect(result.current.showThinking).toBe(false);
		});
	});

	describe("participant selection", () => {
		it("starts empty", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.selectedProfileIds.size).toBe(0);
		});

		it("toggles a profile on", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleProfile("profile-1"));
			expect(result.current.selectedProfileIds.has("profile-1")).toBe(
				true,
			);
		});

		it("toggles a profile off when already selected", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleProfile("profile-1"));
			act(() => result.current.toggleProfile("profile-1"));
			expect(result.current.selectedProfileIds.has("profile-1")).toBe(
				false,
			);
		});

		it("selects multiple profiles independently", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleProfile("p1"));
			act(() => result.current.toggleProfile("p2"));
			expect(result.current.selectedProfileIds.size).toBe(2);
			expect(result.current.selectedProfileIds.has("p1")).toBe(true);
			expect(result.current.selectedProfileIds.has("p2")).toBe(true);
		});

		it("replaces selection via setSelectedProfileIds", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleProfile("p1"));
			act(() =>
				result.current.setSelectedProfileIds(new Set(["p3", "p4"])),
			);
			expect(result.current.selectedProfileIds.size).toBe(2);
			expect(result.current.selectedProfileIds.has("p3")).toBe(true);
			expect(result.current.selectedProfileIds.has("p4")).toBe(true);
			expect(result.current.selectedProfileIds.has("p1")).toBe(false);
		});
	});

	describe("participant dropdown", () => {
		it("starts closed", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.showParticipantDropdown).toBe(false);
		});

		it("toggles visibility", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleParticipantDropdown());
			expect(result.current.showParticipantDropdown).toBe(true);
			act(() => result.current.toggleParticipantDropdown());
			expect(result.current.showParticipantDropdown).toBe(false);
		});

		it("closes explicitly", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleParticipantDropdown());
			act(() => result.current.closeParticipantDropdown());
			expect(result.current.showParticipantDropdown).toBe(false);
		});

		it("closes on mousedown outside the dropdown ref", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleParticipantDropdown());
			expect(result.current.showParticipantDropdown).toBe(true);

			// Simulate mousedown on document (outside the dropdown)
			act(() => {
				const event = new MouseEvent("mousedown", { bubbles: true });
				document.dispatchEvent(event);
			});

			expect(result.current.showParticipantDropdown).toBe(false);
		});
	});

	describe("typing agents", () => {
		it("starts empty", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.typingAgents.size).toBe(0);
		});

		it("adds typing agents", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.addTypingAgent("Gemini"));
			act(() => result.current.addTypingAgent("Cloudy"));
			expect(result.current.typingAgents.size).toBe(2);
			expect(result.current.typingAgents.has("Gemini")).toBe(true);
			expect(result.current.typingAgents.has("Cloudy")).toBe(true);
		});

		it("removes typing agents", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.addTypingAgent("Gemini"));
			act(() => result.current.removeTypingAgent("Gemini"));
			expect(result.current.typingAgents.size).toBe(0);
		});

		it("clears all typing agents", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.addTypingAgent("Gemini"));
			act(() => result.current.addTypingAgent("Cloudy"));
			act(() => result.current.clearTypingAgents());
			expect(result.current.typingAgents.size).toBe(0);
		});
	});

	describe("editing state", () => {
		it("starts not editing", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.isEditing).toBe(false);
			expect(result.current.editMessageText).toBe("");
			expect(result.current.originalMessages).toEqual([]);
		});

		it("starts editing with text", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.startEditing("Hello world"));
			expect(result.current.isEditing).toBe(true);
			expect(result.current.editMessageText).toBe("Hello world");
		});

		it("cancels editing", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.startEditing("Hello world"));
			act(() => result.current.cancelEditing());
			expect(result.current.isEditing).toBe(false);
			expect(result.current.editMessageText).toBe("");
		});
	});

	describe("attachments", () => {
		it("starts empty", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.messageAttachments).toEqual([]);
		});

		it("sets attachments", () => {
			const { result } = renderHook(() => useChatUI());
			const attachments = [
				{
					id: "1",
					type: "markdown" as const,
					path: "note.md",
					name: "Note",
				},
			];
			act(() => result.current.setMessageAttachments(attachments));
			expect(result.current.messageAttachments).toEqual(attachments);
		});
	});

	describe("message selection", () => {
		it("enters selection mode and toggles messages", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.enterSelectionMode("m1"));
			expect(result.current.selectionMode).toBe(true);
			expect(result.current.selectedMessageIds.has("m1")).toBe(true);
			act(() => result.current.toggleMessageSelection("m2"));
			expect(result.current.selectedMessageIds).toEqual(
				new Set(["m1", "m2"]),
			);
			act(() => result.current.toggleMessageSelection("m1"));
			expect(result.current.selectedMessageIds).toEqual(new Set(["m2"]));
		});

		it("clears selection mode and selected messages", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.enterSelectionMode("m1"));
			act(() => result.current.clearMessageSelection());
			expect(result.current.selectionMode).toBe(false);
			expect(result.current.selectedMessageIds.size).toBe(0);
		});
	});

	describe("auto-approve", () => {
		it("starts false", () => {
			const { result } = renderHook(() => useChatUI());
			expect(result.current.autoApprove).toBe(false);
		});

		it("toggles auto-approve", () => {
			const { result } = renderHook(() => useChatUI());
			act(() => result.current.toggleAutoApprove());
			expect(result.current.autoApprove).toBe(true);
			act(() => result.current.toggleAutoApprove());
			expect(result.current.autoApprove).toBe(false);
		});
	});

	describe("resetUIState", () => {
		it("resets all mutable UI state to defaults", () => {
			const { result } = renderHook(() => useChatUI());

			// Mutate everything
			act(() => {
				result.current.openSessionPicker();
				result.current.toggleZenMode();
				result.current.toggleDebateMode();
				result.current.toggleShowThinking();
				result.current.toggleProfile("p1");
				result.current.toggleParticipantDropdown();
				result.current.addTypingAgent("Agent");
				result.current.startEditing("text");
				result.current.toggleAutoApprove();
				result.current.setMessageAttachments([
					{ id: "1", type: "markdown", path: "n.md", name: "N" },
				]);
			});

			// Reset
			act(() => result.current.resetUIState());

			expect(result.current.showSessionPicker).toBe(false);
			expect(result.current.zenMode).toBe(false);
			expect(result.current.debateMode).toBe(false);
			expect(result.current.showThinking).toBe(false);
			expect(result.current.selectedProfileIds.size).toBe(0);
			expect(result.current.showParticipantDropdown).toBe(false);
			expect(result.current.typingAgents.size).toBe(0);
			expect(result.current.isEditing).toBe(false);
			expect(result.current.editMessageText).toBe("");
			expect(result.current.autoApprove).toBe(false);
			expect(result.current.messageAttachments).toEqual([]);
		});
	});
});
