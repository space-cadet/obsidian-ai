import { render, screen } from "@testing-library/react";
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
