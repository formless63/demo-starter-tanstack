import {
	Background,
	type Connection,
	Controls,
	Handle,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useRef } from "react";
import {
	type ConnectionPolicy,
	type GraphDocument,
	proposeConnection,
} from "./graph";

type Props = {
	graph: GraphDocument;
	readOnly: boolean;
	selected: string;
	onSelect: (id: string) => void;
	onPropose: (make: (graph: GraphDocument) => GraphDocument) => void;
	connectionPolicy?: ConnectionPolicy;
	nextId: (prefix: string) => string;
};
function PlainNode({
	data,
	isConnectable,
}: NodeProps<Node<{ label: string }>>) {
	return (
		<>
			<Handle
				type="target"
				position={Position.Top}
				id="in"
				isConnectable={isConnectable}
				isConnectableStart={isConnectable}
				isConnectableEnd={isConnectable}
			/>
			<span>{data.label}</span>
			<Handle
				type="source"
				position={Position.Bottom}
				id="out"
				isConnectable={isConnectable}
				isConnectableStart={isConnectable}
				isConnectableEnd={isConnectable}
			/>
		</>
	);
}
const nodeTypes = { default: PlainNode };
// Vendor internals build CSS selectors from IDs. Imported IDs never enter those selectors.
const wireId = (id: string) =>
	`graph-${Array.from(id, (character) => character.codePointAt(0)!.toString(16)).join("-")}`;
export default function FlowCanvasClient(props: Props) {
	return (
		<ReactFlowProvider>
			<Visual {...props} />
		</ReactFlowProvider>
	);
}
function Visual({
	graph,
	readOnly,
	selected,
	onSelect,
	onPropose: emit,
	connectionPolicy,
	nextId,
}: Props) {
	const active = useRef(false);
	// Native measurements are view state, never imported from or persisted in graph JSON.
	// Retain them across controlled updates so a focused node is not hidden/re-measured.
	const measurements = useRef(new Map<string, { width: number; height: number }>());
	const liveIds = new Set(graph.nodes.map((node) => wireId(node.id)));
	for (const id of measurements.current.keys())
		if (!liveIds.has(id)) measurements.current.delete(id);
	const currentReadOnly = useRef(readOnly);
	currentReadOnly.current = readOnly;
	const currentSelection = useRef(selected);
	currentSelection.current = selected;
	const latestPolicy = useRef(connectionPolicy);
	latestPolicy.current = connectionPolicy;
	const { setViewport } = useReactFlow();
	const view = graph.viewport ?? { x: 0, y: 0, zoom: 1 };
	useEffect(() => {
		if (readOnly)
			void setViewport(
				{ x: view.x, y: view.y, zoom: view.zoom },
				{ duration: 0 },
			);
	}, [readOnly, setViewport, view.x, view.y, view.zoom]);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const onPropose: Props["onPropose"] = (make) => {
		if (active.current && !currentReadOnly.current) emit(make);
	};
	const originalIds = new Map(
		graph.nodes.map((node) => [wireId(node.id), node.id]),
	);
	const nodes = graph.nodes.map((n) => ({
		id: wireId(n.id),
		type: n.kind,
		position: { ...n.position },
		measured: measurements.current.get(wireId(n.id)),
		data: { label: n.label },
		selected: n.id === selected,
		ariaLabel: n.label,
	}));
	const edges = graph.edges.map((e) => ({
		...e,
		id: wireId(e.id),
		source: wireId(e.source),
		target: wireId(e.target),
	}));
	function connection(candidate: Connection) {
		return {
			id: nextId("edge"),
			source: originalIds.get(candidate.source) ?? "",
			target: originalIds.get(candidate.target) ?? "",
			sourceHandle: "out" as const,
			targetHandle: "in" as const,
		};
	}
	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			nodeTypes={nodeTypes}
			defaultViewport={graph.viewport ?? { x: 0, y: 0, zoom: 1 }}
			viewport={
				readOnly
					? undefined
					: { ...(graph.viewport ?? { x: 0, y: 0, zoom: 1 }) }
			}
			minZoom={0.1}
			maxZoom={4}
			onViewportChange={(viewport) => {
				if (!readOnly) onPropose((g) => ({ ...g, viewport }));
			}}
			nodesDraggable={!readOnly}
			nodesConnectable={!readOnly}
			edgesReconnectable={false}
			deleteKeyCode={null}
			selectionKeyCode={null}
			multiSelectionKeyCode={null}
			onNodeClick={(_e, node) => {
				if (active.current) onSelect(originalIds.get(node.id) ?? "");
			}}
			onPaneClick={() => {
				if (active.current) onSelect("");
			}}
			onNodesChange={(changes) => {
				if (!active.current) return;
				for (const change of changes) {
					if (change.type !== "dimensions" || !originalIds.has(change.id)) continue;
					const size = change.dimensions;
					if (size && Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0)
						measurements.current.set(change.id, { width: size.width, height: size.height });
				}
				const selections = new Map<string, boolean>();
				for (const change of changes)
					if (change.type === "select") {
						const id = originalIds.get(change.id);
						if (id !== undefined) selections.set(id, change.selected);
					}
				const replacement = [...selections]
					.reverse()
					.find(([, chosen]) => chosen)?.[0];
				const nextSelection =
					replacement ??
					(selections.get(currentSelection.current) === false
						? ""
						: currentSelection.current);
				if (
					replacement !== undefined ||
					nextSelection !== currentSelection.current
				)
					onSelect(nextSelection);
				const positions = changes.filter(
					(change) => change.type === "position" && change.position,
				);
				if (!readOnly && positions.length)
					onPropose((g) => ({
						...g,
						nodes: g.nodes.map((node) => {
							const change = positions.find(
								(change) =>
									change.type === "position" && change.id === wireId(node.id),
							);
							return change?.type === "position" && change.position
								? { ...node, position: { ...change.position } }
								: node;
						}),
					}));
			}}
			onConnect={(candidate) =>
				onPropose((g) =>
					proposeConnection(g, connection(candidate), latestPolicy.current),
				)
			}
			isValidConnection={(candidate) => {
				try {
					proposeConnection(
						graph,
						{
							id: nextId("preview"),
							source: originalIds.get(candidate.source) ?? "",
							target: originalIds.get(candidate.target) ?? "",
							sourceHandle: "out",
							targetHandle: "in",
						},
						latestPolicy.current,
					);
					return !readOnly;
				} catch {
					return false;
				}
			}}
			proOptions={{ hideAttribution: false }}
		>
			<Background />
			<Controls showInteractive={false} fitViewOptions={{ duration: 0 }} />
		</ReactFlow>
	);
}
