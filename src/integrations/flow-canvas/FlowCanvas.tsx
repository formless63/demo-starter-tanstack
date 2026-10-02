import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import {
	type ConnectionPolicy,
	deleteGraphNode,
	type GraphDocument,
	proposeConnection,
	validateGraph,
} from "./graph";
import "./flow-canvas.css";

const Canvas = lazy(() => import("./FlowCanvasClient"));
export type FlowCanvasProps = {
	documentKey: string;
	value: GraphDocument;
	onChange: (proposal: GraphDocument) => void;
	readOnly?: boolean;
	label?: string;
	connectionPolicy?: ConnectionPolicy;
};

/** Value and persistence belong to the caller. Change documentKey on record replacement. */
export function FlowCanvas(props: FlowCanvasProps) {
	const identity = useRef(props.documentKey);
	identity.current = props.documentKey;
	return (
		<Editor
			key={props.documentKey}
			{...props}
			isCurrent={() => identity.current === props.documentKey}
		/>
	);
}
function Editor({
	value,
	documentKey,
	onChange,
	readOnly = false,
	label = "Flow editor",
	connectionPolicy,
	isCurrent,
}: FlowCanvasProps & { isCurrent: () => boolean }) {
	const graph = validateGraph(value);
	const latest = useRef({ graph, readOnly, onChange, connectionPolicy });
	latest.current = { graph, readOnly, onChange, connectionPolicy };
	const active = useRef(false);
	const [ready, setReady] = useState(false);
	const [selected, setSelected] = useState("");
	const [status, setStatus] = useState("");
	const [gesture, setGesture] = useState(0);
	const [, refresh] = useState(0);
	const boundary = useRef({ gesture, readOnly, epoch: 0 });
	if (
		boundary.current.gesture !== gesture ||
		boundary.current.readOnly !== readOnly
	)
		boundary.current = { gesture, readOnly, epoch: boundary.current.epoch + 1 };
	const epoch = boundary.current.epoch;
	const [name, setName] = useState("New node");
	const [source, setSource] = useState("");
	const [target, setTarget] = useState("");
	const [x, setX] = useState("0");
	const [y, setY] = useState("0");
	const id = useId();
	const counter = useRef(0);
	const addRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		active.current = true;
		setReady(true);
		return () => {
			active.current = false;
		};
	}, []);
	const node = graph.nodes.find((n) => n.id === selected);
	useEffect(() => {
		if (selected && !node) setSelected("");
	}, [selected, node]);
	function propose(make: (current: GraphDocument) => GraphDocument) {
		if (!active.current || !isCurrent() || latest.current.readOnly) return;
		try {
			const next = validateGraph(make(latest.current.graph));
			latest.current.onChange(next);
			setStatus("Change proposed.");
		} catch {
			setStatus("Change rejected. Check graph limits and connection policy.");
		}
		// Fresh controlled props restore vendor state even when parent rejects the proposal.
		refresh((n) => n + 1);
	}
	function nextId(prefix: string) {
		let result = "";
		do {
			result = `${prefix}-${++counter.current}`;
		} while (
			latest.current.graph.nodes.some((n) => n.id === result) ||
			latest.current.graph.edges.some((e) => e.id === result)
		);
		return result;
	}
	function choose(nodeId: string) {
		setSelected(nodeId);
		const current = latest.current.graph.nodes.find((n) => n.id === nodeId);
		if (current) {
			setName(current.label);
			setX(String(current.position.x));
			setY(String(current.position.y));
		}
	}
	function remove() {
		if (!node) return;
		propose((g) => deleteGraphNode(g, node.id));
		addRef.current?.focus();
	}
	const locked = readOnly || !ready;
	return (
		<section
			className="flow-editor"
			aria-label={label}
			data-document-key={documentKey}
		>
			<h2>{label}</h2>
			<p>
				Use the graph list and controls below, or the interactive canvas.
				Changes are proposals to the application.
			</p>
			<fieldset
				className="flow-visual"
				aria-label="Interactive graph"
				onKeyDownCapture={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						boundary.current.epoch++;
						setSelected("");
						setGesture((n) => n + 1);
						setStatus("Selection and gesture cleared.");
					}
				}}
			>
				{ready ? (
					<Suspense fallback={<p>Loading interactive canvas…</p>}>
						<Canvas
							key={`${gesture}:${readOnly}`}
							graph={graph}
							readOnly={readOnly}
							selected={selected}
							onSelect={(id) => {
								if (boundary.current.epoch === epoch) choose(id);
							}}
							onPropose={(make) => {
								if (boundary.current.epoch === epoch) propose(make);
							}}
							connectionPolicy={connectionPolicy}
							nextId={nextId}
						/>
					</Suspense>
				) : (
					<p>
						Interactive canvas loads after hydration. The graph is available
						below.
					</p>
				)}
			</fieldset>
			<output aria-live="polite">{status}</output>
			<h3>Graph nodes</h3>
			<ul aria-label={`${label} nodes`}>
				{graph.nodes.map((n) => (
					<li key={n.id}>
						<button
							type="button"
							disabled={!ready}
							aria-pressed={selected === n.id}
							onClick={() => choose(n.id)}
						>
							{n.label || "(unnamed)"} ({n.id})
						</button>{" "}
						at {n.position.x}, {n.position.y}
					</li>
				))}
			</ul>
			<h3>Graph connections</h3>
			<ul aria-label={`${label} connections`}>
				{graph.edges.map((e) => (
					<li key={e.id}>
						{e.source} → {e.target}
						{e.label ? `: ${e.label}` : ""}{" "}
						<button
							type="button"
							disabled={locked}
							onClick={() =>
								propose((g) => ({
									...g,
									edges: g.edges.filter((item) => item.id !== e.id),
								}))
							}
						>
							Delete connection {e.id}
						</button>
					</li>
				))}
			</ul>
			<fieldset disabled={locked}>
				<legend>Graph controls</legend>
				<label htmlFor={`${id}-name`}>Node label</label>
				<input
					id={`${id}-name`}
					value={name}
					maxLength={1000}
					onChange={(e) => setName(e.target.value)}
				/>
				<label htmlFor={`${id}-x`}>X position</label>
				<input
					id={`${id}-x`}
					type="number"
					min={-1e6}
					max={1e6}
					value={x}
					onChange={(e) => setX(e.target.value)}
				/>
				<label htmlFor={`${id}-y`}>Y position</label>
				<input
					id={`${id}-y`}
					type="number"
					min={-1e6}
					max={1e6}
					value={y}
					onChange={(e) => setY(e.target.value)}
				/>
				<button
					ref={addRef}
					type="button"
					onClick={() =>
						propose((g) => ({
							...g,
							nodes: [
								...g.nodes,
								{
									id: nextId("node"),
									kind: "default",
									label: name,
									position: { x: Number(x), y: Number(y) },
								},
							],
						}))
					}
				>
					Add node
				</button>
				<button
					type="button"
					disabled={!node}
					onClick={() =>
						propose((g) => ({
							...g,
							nodes: g.nodes.map((n) =>
								n.id === selected ? { ...n, label: name } : n,
							),
						}))
					}
				>
					Rename selected node
				</button>
				<button
					type="button"
					disabled={!node}
					onClick={() =>
						propose((g) => ({
							...g,
							nodes: g.nodes.map((n) =>
								n.id === selected
									? { ...n, position: { x: Number(x), y: Number(y) } }
									: n,
							),
						}))
					}
				>
					Position selected node
				</button>
				<button type="button" disabled={!node} onClick={remove}>
					Delete selected node
				</button>
				<label htmlFor={`${id}-source`}>Connection source</label>
				<select
					id={`${id}-source`}
					value={source}
					onChange={(e) => setSource(e.target.value)}
				>
					<option value="">Choose source</option>
					{graph.nodes.map((n) => (
						<option key={n.id} value={n.id}>
							{n.label} ({n.id})
						</option>
					))}
				</select>
				<label htmlFor={`${id}-target`}>Connection target</label>
				<select
					id={`${id}-target`}
					value={target}
					onChange={(e) => setTarget(e.target.value)}
				>
					<option value="">Choose target</option>
					{graph.nodes.map((n) => (
						<option key={n.id} value={n.id}>
							{n.label} ({n.id})
						</option>
					))}
				</select>
				<button
					type="button"
					onClick={() =>
						propose((g) =>
							proposeConnection(
								g,
								{
									id: nextId("edge"),
									source,
									target,
									sourceHandle: "out",
									targetHandle: "in",
								},
								latest.current.connectionPolicy,
							),
						)
					}
				>
					Connect nodes
				</button>
				<button
					type="button"
					onClick={() =>
						propose((g) => ({ ...g, viewport: { x: 0, y: 0, zoom: 1 } }))
					}
				>
					Reset viewport
				</button>
			</fieldset>
			{readOnly ? (
				<p>
					Read-only graph. Select nodes and navigate the canvas without editing.
				</p>
			) : null}
		</section>
	);
}
