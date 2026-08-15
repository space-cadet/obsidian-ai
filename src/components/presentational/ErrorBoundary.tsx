import React, { Component, ReactNode } from "react";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
}

function getLogger(): {
	log: (level: string, ...args: any[]) => void;
	flushNow: () => void;
} | null {
	return (window as any).__obsidianAiLogger ?? null;
}

export class ChatErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		const logger = getLogger();
		const msg = `[ChatErrorBoundary] React render error: ${error.message}\nStack: ${error.stack}\nComponentStack: ${errorInfo.componentStack}`;
		if (logger) {
			logger.log("fatal", msg);
			logger.flushNow();
		} else {
			// Fallback if logger not yet mounted
			console.error(msg);
		}
	}

	render() {
		if (this.state.hasError) {
			return (
				this.props.fallback ?? (
					<div
						style={{ padding: "1rem", color: "var(--text-error)" }}
					>
						<h3>Obsidian AI Chat crashed</h3>
						<p>
							The chat panel encountered a rendering error. Check
							the debug log for details.
						</p>
						<p>
							<code>
								.vault/.obsidian/plugins/chat-lab/debug.log
							</code>
						</p>
					</div>
				)
			);
		}
		return this.props.children;
	}
}
