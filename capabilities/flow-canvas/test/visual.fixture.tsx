import { act, cleanup, render } from "@testing-library/react";
import type { Connection, ReactFlowProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import FlowCanvasClient from "../../../src/integrations/flow-canvas/FlowCanvasClient";
import {
	type ConnectionPolicy,
	type GraphDocument,
	GraphValidationError,
	validateGraph,
} from "../../../src/integrations/flow-canvas/graph";

const vendor = vi.hoisted(() => ({
	renders: [] as ReactFlowProps[],
 handles: [] as Record<string,unknown>[],
	setViewport: vi.fn(async () => true),
}));

// The real component is under test; only the vendor rendering/runtime is replaced.
// Pointer events and viewport behavior still require the actual browser fixture.
vi.mock("@xyflow/react", () => ({
	ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
	ReactFlow: (props: ReactFlowProps) => {
		vendor.renders.push(props);
		return <div data-testid="vendor-flow" />;
	},
	Handle: (props:Record<string,unknown>) => {vendor.handles.push(props);return null;},
	Background: () => null,
	Controls: () => null,
	Position: { Top: "top", Bottom: "bottom" },
	useReactFlow: () => ({ setViewport: vendor.setViewport }),
}));

type ClientProps = Parameters<typeof FlowCanvasClient>[0];
const initial = (): GraphDocument => ({
	schemaVersion: 1,
	nodes: [
		{ id: "a", kind: "default", label: "Alpha", position: { x: 10, y: 20 } },
		{ id: "b", kind: "default", label: "Beta", position: { x: 100, y: 200 } },
	],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
});
function nodeId(index = 0, flow = latest()): string {
	const id = flow.nodes?.[index].id;
	if (!id) throw new Error("Expected vendor node identity");
	return id;
}
function connection(flow = latest()): Connection {
	return {
		source: nodeId(0, flow),
		target: nodeId(1, flow),
		sourceHandle: "out",
		targetHandle: "in",
	};
}
function properties(overrides: Partial<ClientProps> = {}): ClientProps {
	let counter = 0;
	return {
		graph: initial(),
		readOnly: false,
		selected: "a",
		onSelect: vi.fn(),
		onPropose: vi.fn(),
		nextId: vi.fn((prefix) => `${prefix}-${++counter}`),
		...overrides,
	};
}
function latest(): ReactFlowProps {
	const result = vendor.renders.at(-1);
	if (!result) throw new Error("Expected ReactFlow props");
	return result;
}

beforeEach(() => {
	vendor.renders = [];
 vendor.handles=[];
	vendor.setViewport.mockClear();
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("FlowCanvasClient vendor boundary (actual component)", () => {
	test("trusted native dimensions survive controlled updates without entering graph proposals", () => {
		const options = properties();
		const view = render(<FlowCanvasClient {...options} />);
		act(() => latest().onNodesChange?.([{id: nodeId(), type: "dimensions", dimensions: {width: 160, height: 44}}]));
		expect(options.onPropose).not.toHaveBeenCalled();
		view.rerender(<FlowCanvasClient {...options} graph={validateGraph(options.graph)} />);
		expect(latest().nodes?.[0].measured).toEqual({width: 160, height: 44});
		act(() => latest().onNodesChange?.([{id: nodeId(), type: "dimensions", dimensions: {width: 180, height: 60}}]));
		view.rerender(<FlowCanvasClient {...options} selected="b" />);
		expect(latest().nodes?.[0].measured).toEqual({width: 180, height: 60});
		act(() => latest().onNodesChange?.([{id: nodeId(), type: "position", position: {x: 20, y: 30}}]));
		const make = vi.mocked(options.onPropose).mock.calls[0][0];
		expect(make(options.graph).nodes[0]).not.toHaveProperty("measured");
	});

	test("native dimensions are pruned on removal and reset for a new visual instance", () => {
		const options = properties();
		const view = render(<FlowCanvasClient {...options} />);
		const stale = latest();
		act(() => stale.onNodesChange?.([{id: nodeId(), type: "dimensions", dimensions: {width: 160, height: 44}}]));
		view.rerender(<FlowCanvasClient {...options} graph={{...options.graph, nodes: []}} />);
		view.rerender(<FlowCanvasClient {...options} />);
		expect(latest().nodes?.[0].measured).toBeUndefined();
		view.unmount();
		render(<FlowCanvasClient {...options} />);
		act(() => stale.onNodesChange?.([{id: nodeId(), type: "dimensions", dimensions: {width: 999, height: 999}}]));
		expect(latest().nodes?.[0].measured).toBeUndefined();
	});

	test("continuous pointer and keyboard position events emit canonical controlled proposals", () => {
		let current = initial();
		const proposed: GraphDocument[] = [];
		const onPropose = vi.fn<ClientProps["onPropose"]>((make) => {
			current = validateGraph(make(current));
			proposed.push(current);
		});
		const options = properties({ graph: current, onPropose });
		const view = render(<FlowCanvasClient {...options} />);
		act(() =>
			latest().onNodesChange?.([
				{
					id: nodeId(),
					type: "position",
					position: { x: 45, y: 55 },
					dragging: true,
				},
			]),
		);
		expect(onPropose).toHaveBeenCalledTimes(1);
		expect(proposed[0].nodes[0].position).toEqual({ x: 45, y: 55 });
		view.rerender(<FlowCanvasClient {...options} graph={current} />);
		expect(latest().nodes?.[0].position).toEqual({ x: 45, y: 55 });
		// Vendor keyboard motion emits a position change without an onDragStop.
		act(() =>
			latest().onNodesChange?.([
				{
					id: nodeId(),
					type: "position",
					position: { x: 50, y: 55 },
					dragging: false,
				},
			]),
		);
		expect(onPropose).toHaveBeenCalledTimes(2);
		expect(proposed[1].nodes[0].position).toEqual({ x: 50, y: 55 });
		expect(proposed[1].nodes[1].position).toEqual({ x: 100, y: 200 });
		expect(options.graph.nodes[0].position).toEqual({ x: 10, y: 20 });
	});

	test("rejected controlled props replace mutated vendor objects with fresh caller values", () => {
		const options = properties();
		const view = render(<FlowCanvasClient {...options} />);
		const oldNodes = latest().nodes;
		const oldViewport = latest().viewport;
		if (!oldNodes) throw new Error("Expected controlled vendor nodes");
		oldNodes[0].position.x = 999;
		act(() =>
			latest().onNodesChange?.([
				{
					id: nodeId(),
					type: "position",
					position: { x: 999, y: 20 },
					dragging: true,
				},
			]),
		);
		expect(options.onPropose).toHaveBeenCalledTimes(1);
		// The Editor refreshes after parent rejection; the caller retains its value.
		view.rerender(<FlowCanvasClient {...options} />);
		expect(latest().nodes).not.toBe(oldNodes);
		expect(latest().nodes?.[0]).not.toBe(oldNodes[0]);
		expect(latest().nodes?.[0].position).toEqual({ x: 10, y: 20 });
		expect(latest().viewport).not.toBe(oldViewport);
		expect(options.graph.nodes[0].position).toEqual({ x: 10, y: 20 });
	});

	test("retained mutation callbacks from an unmounted visual do not emit after remount", () => {
		const options = properties();
		const view = render(<FlowCanvasClient {...options} />);
		const stale = latest();
		view.unmount();
		render(<FlowCanvasClient {...options} />);
		act(() => {
			stale.onNodesChange?.([
				{ id: nodeId(0, stale), type: "position", position: { x: 999, y: 20 } },
			]);
			stale.onConnect?.(connection(stale));
			stale.onViewportChange?.({ x: 999, y: 999, zoom: 2 });
		});
		expect(options.onPropose).not.toHaveBeenCalled();
		expect(options.nextId).not.toHaveBeenCalled();
		act(() =>
			latest().onNodesChange?.([
				{ id: nodeId(), type: "position", position: { x: 15, y: 20 } },
			]),
		);
		expect(options.onPropose).toHaveBeenCalledTimes(1);
	});

	test("a retained onConnect callback consults the current policy after a same-component policy change", () => {
		const graph = initial();
		const accepted: GraphDocument[] = [];
		const originalPolicy = vi.fn<ConnectionPolicy>(() => true);
		const latestPolicy = vi.fn<ConnectionPolicy>(() => false);
		const onPropose = vi.fn<ClientProps["onPropose"]>((make) => {
			accepted.push(make(graph));
		});
		const options = properties({
			graph,
			onPropose,
			connectionPolicy: originalPolicy,
		});
		const view = render(<FlowCanvasClient {...options} />);
		const stale = latest().onConnect;
		view.rerender(
			<FlowCanvasClient {...options} connectionPolicy={latestPolicy} />,
		);
		expect(() => stale?.(connection())).toThrow(GraphValidationError);
		expect(originalPolicy).not.toHaveBeenCalled();
		expect(latestPolicy).toHaveBeenCalledTimes(1);
		expect(accepted).toHaveLength(0);
		view.rerender(
			<FlowCanvasClient {...options} connectionPolicy={originalPolicy} />,
		);
		act(() => stale?.(connection()));
		expect(originalPolicy).toHaveBeenCalledTimes(1);
		expect(accepted[0].edges).toHaveLength(1);
	});

	test("connection previews use caller-generated IDs instead of colliding with a valid reserved-looking ID", () => {
		const graph = initial();
		graph.nodes.push({
			id: "__connection-preview",
			kind: "default",
			label: "Valid ID",
			position: { x: 0, y: 0 },
		});
		const nextId = vi.fn((prefix: string) => `${prefix}-unused`);
		render(<FlowCanvasClient {...properties({ graph, nextId })} />);
		expect(latest().isValidConnection?.(connection())).toBe(true);
		expect(nextId).toHaveBeenCalledWith("preview");
	});

	test("read-only parent viewport changes synchronize navigation without proposing data changes", () => {
		const options = properties({ readOnly: true });
		const view = render(<FlowCanvasClient {...options} />);
		expect(vendor.setViewport).toHaveBeenLastCalledWith(
			{ x: 0, y: 0, zoom: 1 },
			{ duration: 0 },
		);
		vendor.setViewport.mockClear();
		const graph = { ...options.graph, viewport: { x: 50, y: -20, zoom: 1.5 } };
		view.rerender(<FlowCanvasClient {...options} graph={graph} />);
		expect(vendor.setViewport).toHaveBeenCalledTimes(1);
		expect(vendor.setViewport).toHaveBeenCalledWith(graph.viewport, {
			duration: 0,
		});
		expect(latest().viewport).toBeUndefined();
		expect(latest().nodesDraggable).toBe(false);
		expect(latest().nodesConnectable).toBe(false);
		act(() => {
			latest().onViewportChange?.({ x: 1, y: 2, zoom: 2 });
			latest().onNodesChange?.([
				{ id: nodeId(), type: "position", position: { x: 999, y: 20 } },
			]);
		});
		expect(options.onPropose).not.toHaveBeenCalled();
	});

	test("hostile IDs stay selector-safe in vendor state and map callbacks back to original graph identities", () => {
		const graph = initial();
		graph.nodes[0].id = 'a"[data-x="injected"]\n🦊';
		graph.nodes[1].id = "b']\\selector";
		graph.edges = [
			{
				id: 'edge"[]\n',
				source: graph.nodes[1].id,
				target: graph.nodes[0].id,
				sourceHandle: "out",
				targetHandle: "in",
			},
		];
		const proposed: GraphDocument[] = [];
		const onPropose = vi.fn<ClientProps["onPropose"]>((make) => {
			proposed.push(validateGraph(make(graph)));
		});
		const options = properties({
			graph,
			onPropose,
			selected: graph.nodes[0].id,
		});
		const view = render(<FlowCanvasClient {...options} />);
		const oldId = nodeId();
		for (const node of latest().nodes ?? [])
			expect(node.id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
		for (const edge of latest().edges ?? []) {
			expect(edge.id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
			expect(edge.source).toBe(nodeId(1));
			expect(edge.target).toBe(nodeId(0));
		}
		expect(latest().nodes?.[0].selected).toBe(true);
		act(() =>
			latest().onNodesChange?.([
				{ id: nodeId(), type: "select", selected: true },
			]),
		);
		expect(options.onSelect).toHaveBeenCalledWith(graph.nodes[0].id);
		act(() =>
			latest().onNodesChange?.([
				{ id: nodeId(), type: "position", position: { x: 30, y: 40 } },
			]),
		);
		expect(proposed[0].nodes[0].id).toBe(graph.nodes[0].id);
		expect(proposed[0].nodes[0].position).toEqual({ x: 30, y: 40 });
		expect(latest().isValidConnection?.(connection())).toBe(true);
		act(() => latest().onConnect?.(connection()));
		expect(proposed[1].edges[1].source).toBe(graph.nodes[0].id);
		expect(proposed[1].edges[1].target).toBe(graph.nodes[1].id);
		view.rerender(<FlowCanvasClient {...options} />);
		expect(nodeId()).toBe(oldId);
	});

	test("selection-only and dimensions-only vendor changes do not emit graph mutations", () => {
		const options = properties();
		render(<FlowCanvasClient {...options} />);
		act(() =>
			latest().onNodesChange?.([
				{ id: nodeId(), type: "select", selected: true },
				{
					id: nodeId(),
					type: "dimensions",
					dimensions: { width: 50, height: 20 },
				},
			]),
		);
		expect(options.onSelect).toHaveBeenCalledWith("a");
		expect(options.onPropose).not.toHaveBeenCalled();
	});
});

for(const readOnly of [false,true])test(`native handles forward connectability start/end when readOnly=${readOnly}`,()=>{
 render(<FlowCanvasClient {...properties({readOnly})}/>);
 const flow=latest();const NodeComponent=flow.nodeTypes?.default;
 if(!NodeComponent)throw new Error('Expected shipped plain node renderer');
 render(<NodeComponent id="rendered" data={{label:'Node'}} isConnectable={flow.nodesConnectable??true} selected={false} dragging={false} draggable deletable selectable zIndex={0} type="default" positionAbsoluteX={0} positionAbsoluteY={0}/>);
 expect(vendor.handles).toHaveLength(2);
 for(const handle of vendor.handles){expect(handle.isConnectable).toBe(!readOnly);expect(handle.isConnectableStart).toBe(!readOnly);expect(handle.isConnectableEnd).toBe(!readOnly);}
});
test('false-only native deselection clears the semantic target; unrelated false changes do not',()=>{
 const options=properties();render(<FlowCanvasClient {...options}/>);
 act(()=>latest().onNodesChange?.([{id:nodeId(1),type:'select',selected:false}]));expect(options.onSelect).not.toHaveBeenCalled();
 act(()=>latest().onNodesChange?.([{id:nodeId(0),type:'select',selected:false}]));expect(options.onSelect).toHaveBeenCalledExactlyOnceWith('');expect(options.onPropose).not.toHaveBeenCalled();
});
for(const reversed of [false,true])test(`selection batches prefer replacement selection regardless of order ${reversed}`,()=>{
 const options=properties();render(<FlowCanvasClient {...options}/>);
 const changes=[{id:nodeId(0),type:'select' as const,selected:false},{id:nodeId(1),type:'select' as const,selected:true}];
 act(()=>latest().onNodesChange?.(reversed?changes.reverse():changes));expect(options.onSelect).toHaveBeenCalledExactlyOnceWith('b');expect(options.onPropose).not.toHaveBeenCalled();
});
test('retained native selection callbacks use current selection and final per-node state',()=>{
 const options=properties();const view=render(<FlowCanvasClient {...options}/>);const previous=latest();
 view.rerender(<FlowCanvasClient {...options} selected="b"/>);
 act(()=>previous.onNodesChange?.([{id:nodeId(1,previous),type:'select',selected:true},{id:nodeId(1,previous),type:'select',selected:false}]));
 expect(options.onSelect).toHaveBeenCalledExactlyOnceWith('');
});

test('read-only native callbacks cannot emit proposals even when directly retained/invoked',()=>{
 const options=properties();const view=render(<FlowCanvasClient {...options}/>);const previous=latest();
 view.rerender(<FlowCanvasClient {...options} readOnly/>);
 act(()=>{previous.onConnect?.(connection(previous));previous.onViewportChange?.({x:50,y:50,zoom:2});previous.onNodesChange?.([{id:nodeId(0,previous),type:'position',position:{x:25,y:50}}]);latest().onConnect?.(connection());});
 expect(options.onPropose).not.toHaveBeenCalled();expect(options.nextId).not.toHaveBeenCalled();
});
