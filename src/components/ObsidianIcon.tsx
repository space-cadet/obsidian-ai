import React, { useRef, useEffect } from "react";
import { setIcon } from "obsidian";

interface ObsidianIconProps {
	icon: string;
	className?: string;
	size?: number;
}

export const ObsidianIcon: React.FC<ObsidianIconProps> = ({
	icon,
	className = "",
	size = 16,
}) => {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (ref.current) {
			ref.current.innerHTML = "";
			setIcon(ref.current, icon);
		}
	}, [icon]);
	return (
		<span
			ref={ref}
			className={className}
			style={{
				width: size,
				height: size,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		/>
	);
};

export default ObsidianIcon;
