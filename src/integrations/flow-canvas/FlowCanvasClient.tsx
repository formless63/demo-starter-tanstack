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
function PlainNode({ data }: NodeProps<Node<{ label: string }>>) {
	return (
		<>
			<Handle type="target" position={Position.Top} id="in" />
			<span>{data.label}</span>
			<Handle type="source" position={Position.Bottom} id="out" />
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
		if (active.current) emit(make);
	};
	const originalIds = new Map(
		graph.nodes.map((node) => [wireId(node.id), node.id]),
	);
	const nodes = graph.nodes.map((n) => ({
		id: wireId(n.id),
		type: n.kind,
		position: { ...n.position },
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
				for (const change of changes)
					if (change.type === "select" && change.selected)
						onSelect(originalIds.get(change.id) ?? "");
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
