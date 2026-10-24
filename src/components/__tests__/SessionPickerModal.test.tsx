import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SessionPickerModal from "../presentational/SessionPickerModal";
import type { ChatSession } from "../../types";

const savedSession: ChatSession = {
	id: "saved",
	title: "Saved chat",
	createdAt: 1,
	updatedAt: 1,
	contextItems: [],
	messages: [{ id: "message", role: "user", content: "Hello", timestamp: 1 }],
};

const draftSession: ChatSession = {
	id: "draft",
	title: "Draft chat",
	createdAt: 2,
	updatedAt: 2,
	contextItems: [],
	messages: [],
};

const unhydratedSession: ChatSession = {
	id: "synced",
	title: "Synced chat",
	createdAt: 3,
	updatedAt: 3,
	contextItems: [],
	messages: [],
	messageCount: 3,
	hydrated: false,
};

describe("SessionPickerModal", () => {
	it("shows saved conversations but not empty draft tabs", () => {
		render(
			<SessionPickerModal
				sessions={[draftSession, savedSession]}
				activeSessionId="draft"
				onLoad={vi.fn()}
				onDelete={vi.fn()}
				onRename={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByText("Saved chat")).toBeTruthy();
		expect(screen.queryByText("Draft chat")).toBeNull();
	});

	it("reports and renders every available session tag", () => {
		const currentSession: ChatSession = {
			...savedSession,
			tags: ["current"],
		};
		const otherSession: ChatSession = {
			...savedSession,
			id: "other",
			title: "Other chat",
			createdAt: 0,
			updatedAt: 0,
			tags: ["alpha", "beta", "gamma", "delta", "epsilon"],
		};
		const updateTags = vi.fn();
		render(
			<SessionPickerModal
				sessions={[currentSession, otherSession]}
				activeSessionId={null}
				onLoad={vi.fn()}
				onDelete={vi.fn()}
				onRename={vi.fn()}
				onUpdateTags={updateTags}
				onClose={vi.fn()}
			/>,
		);

		fireEvent.click(
			screen.getAllByRole("button", { name: "Manage tags" })[0],
		);
		const tagDialog = screen.getByRole("dialog", { name: "Manage tags" });
		const tagInput = within(tagDialog).getByRole("combobox", {
			name: "Add or search tags",
		});
		fireEvent.focus(tagInput);

		expect(screen.getByLabelText("5 available tags").textContent).toBe("5");
		expect(within(tagDialog).getAllByRole("combobox")).toHaveLength(1);
		expect(
			within(
				screen.getByRole("listbox", { name: "Available tags" }),
			).getAllByRole("option"),
		).toHaveLength(5);

		fireEvent.change(tagInput, { target: { value: "eps" } });
		expect(screen.getByLabelText("1 available tag").textContent).toBe("1");
		const tagOptions = within(
			screen.getByRole("listbox", { name: "Available tags" }),
		);
		expect(
			tagOptions.getByRole("option", { name: /epsilon/i }),
		).toBeTruthy();
		expect(tagOptions.queryByRole("option", { name: /beta/i })).toBeNull();

		fireEvent.change(tagInput, { target: { value: "new topic" } });
		fireEvent.keyDown(tagInput, { key: "Enter" });
		expect(updateTags).toHaveBeenCalledWith("saved", [
			"current",
			"new topic",
		]);
	});

	it("shows indexed count for unhydrated sessions instead of 'No messages'", () => {
		render(
			<SessionPickerModal
				sessions={[unhydratedSession]}
				activeSessionId={null}
				onLoad={vi.fn()}
				onDelete={vi.fn()}
				onRename={vi.fn()}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.getByText("3 messages — open to view")).toBeTruthy();
		expect(screen.queryByText("No messages")).toBeNull();
	});
});
