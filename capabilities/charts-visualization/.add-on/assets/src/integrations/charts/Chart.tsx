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
export function Chart({
	data,
	kind = "line",
	title,
	description,
	className,
}: ChartProps) {
	const titleId = useId(),
		descriptionId = useId(),
		frame = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(640);
	useEffect(() => {
		const el = frame.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const o = new ResizeObserver(
			([e]) => e && setWidth(Math.max(280, Math.round(e.contentRect.width))),
		);
		o.observe(el);
		return () => o.disconnect();
	}, []);
	const max = Math.max(1, ...data.map((d) => d.value)),
		points = data.map(
			(d, i) =>
				`${(i / Math.max(1, data.length - 1)) * 100},${100 - (d.value / max) * 88}`,
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
					data.map((d, i) => (
						<rect
							key={d.label}
							x={`${(i / data.length) * 100 + 1}%`}
							y={`${100 - (d.value / max) * 88}`}
							width={`${Math.max(1, 92 / data.length)}%`}
							height={`${(d.value / max) * 88}%`}
							rx="1"
							fill="currentColor"
						/>
					))}
			</svg>
			<table className="sr-only">
				<caption>{title}</caption>
				<thead>
					<tr>
						<th>Label</th>
						<th>Value</th>
					</tr>
				</thead>
				<tbody>
					{data.map((d) => (
						<tr key={d.label}>
							<th>{d.label}</th>
							<td>{d.value}</td>
						</tr>
					))}
				</tbody>
			</table>
			<span className="sr-only">Chart width {width}px</span>
		</div>
	);
}
