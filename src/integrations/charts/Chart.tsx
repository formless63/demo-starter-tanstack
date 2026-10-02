import { useEffect, useId, useRef, useState } from "react";

export type ChartDatum = { label: string; value: number };
export type ChartKind = "bar" | "line" | "area";

export interface ChartProps {
	data: readonly ChartDatum[];
	kind?: ChartKind;
	title: string;
	description?: string;
	className?: string;
}

/** SSR-safe, dependency-light chart primitive. The SVG frame is deterministic; ResizeObserver only enhances sizing. */
export function Chart({
	data,
	kind = "line",
	title,
	description,
	className,
}: ChartProps) {
	const titleId = useId();
	const descriptionId = useId();
	const frame = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(640);
	useEffect(() => {
		const element = frame.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const max = Math.max(1, ...data.map((item) => item.value));
	const points = data.map(
		(item, index) =>
			`${(index / Math.max(1, data.length - 1)) * 100},${100 - (item.value / max) * 88}`,
	);
	return (
		<div ref={frame} className={className}>
			<svg
				role="img"
				aria-label={title}
				aria-labelledby={`${titleId} ${description ? descriptionId : ""}`}
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				width="100%"
				height="240"
				className="block overflow-visible"
			>
				<title id={titleId}>{title}</title>
				{description && <desc id={descriptionId}>{description}</desc>}
				{kind === "area" && (
					<polygon
						points={`0,100 ${points.join(" ")} 100,100`}
						fill="currentColor"
						opacity=".14"
					/>
				)}
				{kind !== "bar" && (
					<polyline
						points={points.join(" ")}
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
						vectorEffect="non-scaling-stroke"
					/>
				)}
				{kind === "bar" &&
					data.map((item, index) => (
						<rect
							key={item.label}
							x={`${(index / data.length) * 100 + 1}%`}
							y={`${100 - (item.value / max) * 88}`}
							width={`${Math.max(1, 92 / data.length)}%`}
							height={`${(item.value / max) * 88}%`}
							rx="1"
							fill="currentColor"
						/>
					))}
			</svg>
			<table className="sr-only">
				<caption>{title}</caption>
				<thead>
					<tr>
						<th scope="col">Label</th>
						<th scope="col">Value</th>
					</tr>
				</thead>
				<tbody>
					{data.map((item) => (
						<tr key={item.label}>
							<th scope="row">{item.label}</th>
							<td>{item.value}</td>
						</tr>
					))}
				</tbody>
			</table>
			<span className="sr-only">Chart width {width}px</span>
		</div>
	);
}
