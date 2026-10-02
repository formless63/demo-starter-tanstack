import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Chart, type ChartKind } from "#/integrations/charts/Chart";

export const Route = createFileRoute("/charts-test")({ component: ChartsTest });

function ChartsTest() {
	const [kind, setKind] = useState<ChartKind>("line");
	const [visible, setVisible] = useState(true);
	const data = [
		{ label: "Jan", value: 2 },
		{ label: "Feb", value: 5 },
		{ label: "Mar", value: 3 },
	];
	return (
		<main>
			<h1>Charts test fixture</h1>
			<nav aria-label="Chart type">
				<button type="button" onClick={() => setKind("line")}>
					Line
				</button>
				<button type="button" onClick={() => setKind("bar")}>
					Bar
				</button>
				<button type="button" onClick={() => setKind("area")}>
					Area
				</button>
				<button type="button" onClick={() => setVisible((current) => !current)}>
					{visible ? "Unmount" : "Mount"}
				</button>
			</nav>
			<section>
				{visible && (
					<div data-testid="primary-chart" style={{ width: "640px" }}>
						<Chart
							data={data}
							kind={kind}
							title={`${kind} chart`}
							description="Three monthly values"
						/>
					</div>
				)}
				{visible && (
					<div data-testid="secondary-chart">
						<Chart data={data} kind="bar" title="Second chart" />
					</div>
				)}
			</section>
		</main>
	);
}
