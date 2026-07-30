import { useCallback } from "react";

export interface UseExportActionsResult {
	handleExportChat: () => void;
}

export function useExportActions(
	setShowExportModal: (v: boolean) => void,
): UseExportActionsResult {
	const handleExportChat = useCallback(() => {
		setShowExportModal(true);
	}, [setShowExportModal]);

	return { handleExportChat };
}
