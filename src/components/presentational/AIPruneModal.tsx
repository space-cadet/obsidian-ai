import React, { useState, useEffect, useRef, useCallback } from "react";
import {
	MemoryOptimizer,
	ProgressUpdate,
} from "../../intelligence/MemoryOptimizer";

interface AIPruneModalProps {
	onClose: () => void;
	createOptimizer: () => MemoryOptimizer;
}

interface LogEntry {
	time: string;
	message: string;
}

const AIPruneModal: React.FC<AIPruneModalProps> = ({
	onClose,
	createOptimizer,
}) => {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [stage, setStage] = useState<ProgressUpdate["stage"]>("loading");
	const [current, setCurrent] = useState(0);
	const [total, setTotal] = useState(0);
	const [eta, setEta] = useState<number | undefined>();
	const [isRunning, setIsRunning] = useState(true);
	const [result, setResult] = useState<string | null>(null);
	const [restored, setRestored] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const optimizerRef = useRef<MemoryOptimizer | null>(null);
	const cancelRequestedRef = useRef(false);
	const logsEndRef = useRef<HTMLDivElement>(null);

	const addLog = useCallback((message: string) => {
		const time = new Date().toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		setLogs((prev) => [...prev, { time, message }]);
	}, []);

	useEffect(() => {
		const optimizer = createOptimizer();
		optimizerRef.current = optimizer;

		addLog("Starting AI-powered memory optimization...");

		optimizer
			.aiPrune(
				(update) => {
					setStage(update.stage);
					setCurrent(update.current);
					setTotal(update.total);
					setEta(update.etaSeconds);
					addLog(update.message);
				},
				{
					onBeforeSave: (removed, groups) =>
						window.confirm(
							`AI proposes removing ${removed} entries in ${groups} duplicate groups. A backup will be created first. Apply these changes?`,
						),
				},
			)
			.then((pruneResult) => {
				const savedKb = (
					(pruneResult.bytesBefore - pruneResult.bytesAfter) /
					1024
				).toFixed(1);
				addLog(
					`Complete! Removed ${pruneResult.removed} duplicates, saved ~${savedKb} KB.`,
				);
				setResult(
					`Removed ${pruneResult.removed} duplicates (${pruneResult.groups} groups). Kept ${pruneResult.kept} unique entries. Saved ~${savedKb} KB.`,
				);
				setIsRunning(false);
			})
			.catch((err) => {
				if (cancelRequestedRef.current) return;
				const msg = err instanceof Error ? err.message : String(err);
				if (msg === "Cancelled by user") {
					addLog("Cancelled by user.");
					setError("Optimization was cancelled.");
				} else {
					addLog(`Error: ${msg}`);
					setError(`Optimization failed: ${msg}`);
				}
				setIsRunning(false);
			});

		return () => {
			optimizer.cancel();
		};
	}, [createOptimizer, addLog]);

	useEffect(() => {
		logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [logs]);

	const handleCancel = () => {
		if (!isRunning) return;
		cancelRequestedRef.current = true;
		optimizerRef.current?.cancel();
		addLog("Cancelling...");
		setError("Optimization was cancelled.");
		setIsRunning(false);
	};

	const handleRestore = async () => {
		const restoredSnapshot =
			await optimizerRef.current?.restoreLastSnapshot();
		if (restoredSnapshot) {
			setRestored(true);
			setResult(
				"The memory was restored from the backup created before pruning.",
			);
			addLog("Restored the pre-prune memory snapshot.");
		} else {
			setError("No memory backup is available to restore.");
		}
	};

	const formatEta = (seconds?: number): string => {
		if (seconds === undefined) return "";
		if (seconds < 60) return `~${seconds}s remaining`;
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `~${mins}m ${secs}s remaining`;
	};

	const stageLabel: Record<string, string> = {
		loading: "Loading entries...",
		clustering: "Clustering with AI...",
		pruning: "Saving results...",
		done: "Complete",
		error: "Error",
	};

	return (
		<div
			className="chat-modal-overlay"
			onClick={!isRunning ? onClose : undefined}
		>
			<div
				className="chat-modal"
				onClick={(e) => e.stopPropagation()}
				style={{ maxWidth: "560px", width: "90vw" }}
			>
				<div className="chat-modal-header">
					<h3>🤖 AI Memory Optimization</h3>
					{!isRunning && (
						<button
							className="chat-modal-close"
							onClick={onClose}
							aria-label="Close"
						>
							&times;
						</button>
					)}
				</div>
				<div className="chat-modal-body">
					{/* Progress bar */}
					{total > 0 && (
						<div style={{ marginBottom: "12px" }}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									marginBottom: "4px",
									fontSize: "0.85em",
								}}
							>
								<span>{stageLabel[stage] || stage}</span>
								<span>
									{current}/{total}
								</span>
							</div>
							<div
								style={{
									width: "100%",
									height: "6px",
									background:
										"var(--background-modifier-border)",
									borderRadius: "3px",
									overflow: "hidden",
								}}
							>
								<div
									style={{
										width: `${total > 0 ? (current / total) * 100 : 0}%`,
										height: "100%",
										background:
											stage === "error"
												? "var(--text-error)"
												: "var(--interactive-accent)",
										borderRadius: "3px",
										transition: "width 0.3s ease",
									}}
								/>
							</div>
							{eta !== undefined && isRunning && (
								<div
									style={{
										fontSize: "0.8em",
										color: "var(--text-muted)",
										marginTop: "2px",
										textAlign: "right",
									}}
								>
									{formatEta(eta)}
								</div>
							)}
						</div>
					)}

					{/* Log output */}
					<div
						style={{
							fontFamily: "var(--font-monospace)",
							fontSize: "0.85em",
							background: "var(--background-secondary)",
							borderRadius: "6px",
							padding: "10px",
							maxHeight: "300px",
							overflowY: "auto",
							marginBottom: "12px",
						}}
					>
						{logs.map((log, i) => (
							<div key={i} style={{ marginBottom: "2px" }}>
								<span style={{ color: "var(--text-muted)" }}>
									{log.time}
								</span>{" "}
								<span>{log.message}</span>
							</div>
						))}
						<div ref={logsEndRef} />
					</div>

					{/* Result / Error */}
					{result && (
						<div
							style={{
								padding: "10px",
								background:
									"var(--background-modifier-success)" as any,
								borderRadius: "6px",
								fontSize: "0.9em",
								marginBottom: "12px",
							}}
						>
							✅ {result}
						</div>
					)}
					{error && (
						<div
							style={{
								padding: "10px",
								background:
									"var(--background-modifier-error)" as any,
								borderRadius: "6px",
								fontSize: "0.9em",
								marginBottom: "12px",
								color: "var(--text-error)",
							}}
						>
							❌ {error}
						</div>
					)}

					{/* Actions */}
					<div
						style={{
							display: "flex",
							gap: "8px",
							justifyContent: "flex-end",
						}}
					>
						{isRunning ? (
							<button
								className="chat-btn"
								onClick={handleCancel}
								style={{
									background:
										"var(--background-modifier-error)" as any,
									color: "var(--text-error)",
								}}
							>
								⏹ Cancel
							</button>
						) : (
							<>
								{result && !restored && (
									<button
										className="chat-btn"
										onClick={() => void handleRestore()}
									>
										Restore previous memory
									</button>
								)}
								<button
									className="chat-btn chat-btn-primary"
									onClick={onClose}
								>
									Close
								</button>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default AIPruneModal;
