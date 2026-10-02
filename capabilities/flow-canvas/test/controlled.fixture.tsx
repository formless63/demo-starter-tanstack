import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	FlowExample,
	type FlowPersistence,
} from "../../../scripts/flow-canvas-example";
import {
	FlowCanvas,
	type FlowCanvasProps,
} from "../../../src/integrations/flow-canvas/FlowCanvas";
import type {
	ConnectionPolicy,
	GraphDocument,
} from "../../../src/integrations/flow-canvas/graph";

type CanvasSeam = {
	graph: GraphDocument;
	readOnly: boolean;
	selected: string;
	onSelect: (id: string) => void;
	onPropose: (make: (graph: GraphDocument) => GraphDocument) => void;
	connectionPolicy?: ConnectionPolicy;
	nextId: (prefix: string) => string;
};
const seam = vi.hoisted(() => ({
	renders: [] as { instance: string; props: CanvasSeam }[],
}));

// Exercise the real hydrated editor boundary without claiming vendor/browser proof.
vi.mock("../../../src/integrations/flow-canvas/FlowCanvasClient", async () => {
	const { useId } = await import("react");
	return {
		default: function ClientSeam(props: CanvasSeam) {
			const instance = useId();
			seam.renders.push({ instance, props });
			return (
				<div data-testid="canvas-seam" data-instance={instance}>
					{JSON.stringify(props.graph)}
				</div>
			);
		},
	};
});

const graph = (label = "Alpha"): GraphDocument => ({
	schemaVersion: 1,
	nodes: [
		{ id: "a", kind: "default", label, position: { x: 5, y: 10 } },
		{ id: "b", kind: "default", label: "Beta", position: { x: 100, y: 30 } },
	],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
});
const rename =
	(label: string) =>
	(current: GraphDocument): GraphDocument => ({
		...current,
		nodes: current.nodes.map((node, index) =>
			index === 0 ? { ...node, label } : node,
		),
	});
const props = (overrides: Partial<FlowCanvasProps> = {}): FlowCanvasProps => ({
	documentKey: "record-a",
	value: graph(),
	onChange: vi.fn(),
	label: "Test graph",
	...overrides,
});
const region = () => screen.getByRole("region", { name: "Test graph" });
function latest(container: HTMLElement = region()): CanvasSeam {
	const instance = within(container)
		.getByTestId("canvas-seam")
		.getAttribute("data-instance");
	const render = [...seam.renders]
		.reverse()
		.find((item) => item.instance === instance);
	if (!render)
		throw new Error("Expected the lazy client fixture to have rendered");
	return render.props;
}
async function ready(container: HTMLElement = region()): Promise<void> {
	await within(container).findByTestId("canvas-seam");
}
function pending<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
async function settle(operation: () => void) {
	await act(async () => {
		operation();
		await Promise.resolve();
	});
}
function primary() {
	return screen.getByRole("region", { name: "Primary graph" });
}
function editPrimary(label: string) {
	fireEvent.click(
		within(primary()).getByRole("button", {
			name: "Start (start)",
		}),
	);
	fireEvent.change(
		within(primary()).getByLabelText("Node label", { exact: true }),
		{ target: { value: label } },
	);
	fireEvent.click(
		within(primary()).getByRole("button", {
			name: "Rename selected node",
		}),
	);
}

beforeEach(() => {
	seam.renders = [];
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("FlowCanvas controlled editor lifecycle (mocked client seam)", () => {
	test("SSR escapes hostile text and hydration preserves semantic content without emitting", async () => {
		const hostile = '<img src="https://invalid.example/x" onerror="bad()"> 🦊';
		const options = props({ value: graph(hostile) });
		const html = renderToString(<FlowCanvas {...options} />);
		expect(html).toContain("Interactive canvas loads after hydration");
		expect(html).toContain("&lt;img");
		expect(html).not.toContain("<img");
		expect(html).not.toContain("canvas-seam");
		const container = document.createElement("div");
		container.innerHTML = html;
		document.body.append(container);
		expect(container.querySelector("fieldset:disabled")).not.toBeNull();
		const recoverable = vi.fn();
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			await act(async () => {
				root = hydrateRoot(container, <FlowCanvas {...options} />, {
					onRecoverableError: recoverable,
				});
			});
			await within(container).findByTestId("canvas-seam");
			expect(
				within(container).getByRole("button", {
					name: `${hostile} (a)`,
				}).textContent,
			).toBe(`${hostile} (a)`);
			expect(container.querySelector("img")).toBeNull();
			expect(container.querySelector("fieldset:disabled")).toBeNull();
			expect(options.onChange).not.toHaveBeenCalled();
			expect(recoverable).not.toHaveBeenCalled();
			expect(errors).not.toHaveBeenCalled();
		} finally {
			await act(async () => root?.unmount());
			container.remove();
		}
	});

	test("a rejected parent proposal restores fresh canonical client data without mutating value", async () => {
		const options = props();
		const before = structuredClone(options.value);
		render(<FlowCanvas {...options} />);
		await ready();
		const captured = latest();
		act(() => captured.onPropose(rename("Rejected change")));
		expect(options.onChange).toHaveBeenCalledTimes(1);
		expect(vi.mocked(options.onChange).mock.calls[0][0].nodes[0].label).toBe(
			"Rejected change",
		);
		expect(latest().graph).toEqual(before);
		expect(latest().graph).not.toBe(captured.graph);
		expect(latest().graph.nodes[0]).not.toBe(captured.graph.nodes[0]);
		expect(options.value).toEqual(before);
		expect(
			within(region()).getByRole("button", { name: "Alpha (a)" }),
		).toBeTruthy();
	});

	test("current callbacks use the latest accepted graph and onChange callback", async () => {
		const first = vi.fn();
		const second = vi.fn();
		const view = render(<FlowCanvas {...props({ onChange: first })} />);
		await ready();
		const captured = latest();
		const replacement = graph("Replacement");
		replacement.nodes[1].label = "Keep latest sibling";
		view.rerender(
			<FlowCanvas {...props({ value: replacement, onChange: second })} />,
		);
		act(() => captured.onPropose(rename("Fresh proposal")));
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
		expect(second.mock.calls[0][0].nodes[1].label).toBe("Keep latest sibling");
		expect(latest().graph.nodes[0].label).toBe("Replacement");
	});

	test("Escape invalidates pending visual proposals and selection callbacks", async () => {
		const options = props();
		render(<FlowCanvas {...options} />);
		await ready();
		const stale = latest();
		act(() => stale.onSelect("a"));
		expect(latest().selected).toBe("a");
		fireEvent.keyDown(
			within(region()).getByRole("group", {
				name: "Interactive graph",
			}),
			{ key: "Escape" },
		);
		await ready();
		const cancelled = vi.fn(rename("Late gesture"));
		act(() => {
			stale.onPropose(cancelled);
			stale.onSelect("b");
		});
		expect(cancelled).not.toHaveBeenCalled();
		expect(options.onChange).not.toHaveBeenCalled();
		expect(latest().selected).toBe("");
		act(() => latest().onPropose(rename("New gesture")));
		expect(options.onChange).toHaveBeenCalledTimes(1);
	});

	test("Escape capture blocks vendor key handling and same-event stale proposals", async () => {
		const options = props();
		render(<FlowCanvas {...options} />);
		await ready();
		const stale = latest();
		const canvas = within(region()).getByTestId("canvas-seam");
		const vendorKey = vi.fn();
		canvas.addEventListener("keydown", vendorKey);
		const cancelled = vi.fn(rename("Synchronous late gesture"));
		act(() => {
			canvas.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
			stale.onPropose(cancelled);
			stale.onSelect("b");
		});
		expect(vendorKey).not.toHaveBeenCalled();
		expect(cancelled).not.toHaveBeenCalled();
		expect(options.onChange).not.toHaveBeenCalled();
		expect(latest().selected).toBe("");
		expect(within(region()).getByRole("status").textContent).toBe("Selection and gesture cleared.");
	});

	test("readOnly blocks mutations, allows selection, and invalidates callbacks after unlock", async () => {
		const options = props();
		const view = render(<FlowCanvas {...options} />);
		await ready();
		const unlocked = latest();
		view.rerender(<FlowCanvas {...options} readOnly />);
		await ready();
		const locked = latest();
		act(() => {
			unlocked.onPropose(rename("Old edit"));
			locked.onPropose(rename("Locked edit"));
			locked.onSelect("b");
		});
		expect(options.onChange).not.toHaveBeenCalled();
		expect(latest().selected).toBe("b");
		expect(
			within(region())
				.getByRole("group", { name: "Graph controls" })
				.hasAttribute("disabled"),
		).toBe(true);
		view.rerender(<FlowCanvas {...options} readOnly={false} />);
		await ready();
		act(() => {
			unlocked.onPropose(rename("Resurrected edit"));
			locked.onPropose(rename("Late lock callback"));
		});
		expect(options.onChange).not.toHaveBeenCalled();
		act(() => latest().onPropose(rename("New unlocked edit")));
		expect(options.onChange).toHaveBeenCalledTimes(1);
	});

	test("documentKey replacement rejects old callbacks even after switching back to the old key", async () => {
		const onChange = vi.fn();
		const first = props({ onChange });
		const view = render(<FlowCanvas {...first} />);
		await ready();
		const alpha = latest();
		view.rerender(
			<FlowCanvas
				{...first}
				documentKey="record-b"
				value={graph("Record B")}
			/>,
		);
		await ready();
		const beta = latest();
		act(() => alpha.onPropose(rename("Late A")));
		expect(onChange).not.toHaveBeenCalled();
		expect(latest().graph.nodes[0].label).toBe("Record B");
		view.rerender(<FlowCanvas {...first} />);
		await ready();
		act(() => {
			alpha.onPropose(rename("Very late A"));
			beta.onPropose(rename("Late B"));
		});
		expect(onChange).not.toHaveBeenCalled();
		expect(latest().graph.nodes[0].label).toBe("Alpha");
	});

	test("unmounted and prior StrictMode lifetimes cannot emit into a new editor", async () => {
		const options = props();
		const view = render(
			<StrictMode>
				<FlowCanvas {...options} />
			</StrictMode>,
		);
		await ready();
		const stale = latest();
		view.unmount();
		const make = vi.fn(rename("Late unmount"));
		act(() => stale.onPropose(make));
		expect(make).not.toHaveBeenCalled();
		expect(options.onChange).not.toHaveBeenCalled();
		render(<FlowCanvas {...options} />);
		await ready();
		act(() => stale.onPropose(make));
		expect(make).not.toHaveBeenCalled();
		act(() => latest().onPropose(rename("Current mount")));
		expect(options.onChange).toHaveBeenCalledTimes(1);
	});

	test("malformed visual proposals fail safely and leave semantic and client state intact", async () => {
		const options = props();
		render(<FlowCanvas {...options} />);
		await ready();
		const original = latest().graph;
		act(() =>
			latest().onPropose((value) => ({
				...value,
				nodes: [...value.nodes, value.nodes[0]],
			})),
		);
		expect(options.onChange).not.toHaveBeenCalled();
		expect(within(region()).getByRole("status").textContent).toContain(
			"Change rejected",
		);
		expect(latest().graph).toEqual(original);
	});

	test("multiple editor instances isolate IDs, selection and proposals", async () => {
		const left = props({ label: "Left graph" });
		const right = props({ label: "Right graph" });
		render(
			<>
				<FlowCanvas {...left} />
				<FlowCanvas {...right} />
			</>,
		);
		const leftRegion = screen.getByRole("region", { name: "Left graph" });
		const rightRegion = screen.getByRole("region", { name: "Right graph" });
		await ready(leftRegion);
		await ready(rightRegion);
		expect(within(leftRegion).getByLabelText("Node label").id).not.toBe(
			within(rightRegion).getByLabelText("Node label").id,
		);
		act(() => {
			latest(leftRegion).onSelect("a");
			latest(leftRegion).onPropose(rename("Left only"));
		});
		expect(latest(leftRegion).selected).toBe("a");
		expect(latest(rightRegion).selected).toBe("");
		expect(left.onChange).toHaveBeenCalledTimes(1);
		expect(right.onChange).not.toHaveBeenCalled();
	});
});

describe("synthetic application persistence lifecycle (mocked client seam)", () => {
	test("save snapshots are detached, duplicate requests are blocked, and newer edits stay dirty", async () => {
		const saved = pending<void>();
		const save = vi.fn<FlowPersistence["save"]>(() => saved.promise);
		render(<FlowExample persistence={{ save, load: async () => graph() }} />);
		await ready(primary());
		editPrimary("First revision");
		const button = screen.getByRole("button", {
			name: "Save graph",
		});
		fireEvent.click(button);
		fireEvent.click(button);
		expect(save).toHaveBeenCalledTimes(1);
		expect(save.mock.calls[0][0]).toBe("alpha");
		expect(save.mock.calls[0][1].nodes[0].label).toBe("First revision");
		save.mock.calls[0][1].nodes[0].label = "Transport mutation";
		expect(screen.getByTestId("graph-json").textContent).toContain(
			"First revision",
		);
		fireEvent.change(within(primary()).getByLabelText("Node label"), {
			target: { value: "Newer revision" },
		});
		fireEvent.click(
			within(primary()).getByRole("button", { name: "Rename selected node" }),
		);
		await settle(() => saved.resolve());
		expect(screen.getByTestId("dirty").textContent).toBe("Unsaved changes");
		expect(
			screen.getByRole("status", { name: "Persistence status" }).textContent,
		).toContain("newer edits remain");
		expect(screen.getByTestId("graph-json").textContent).toContain(
			"Newer revision",
		);
	});

	test("save rejection and cancelled late completion preserve unsaved edits", async () => {
		const first = pending<void>();
		const second = pending<void>();
		const save = vi
			.fn<FlowPersistence["save"]>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		render(<FlowExample persistence={{ save, load: async () => graph() }} />);
		await ready(primary());
		editPrimary("Unsaved revision");
		fireEvent.click(screen.getByRole("button", { name: "Save graph" }));
		await settle(() => first.reject(new Error("private backend diagnostics")));
		expect(
			screen.getByRole("status", { name: "Persistence status" }).textContent,
		).toBe("Save failed; unsaved edits retained");
		expect(document.body.textContent).not.toContain(
			"private backend diagnostics",
		);
		fireEvent.click(screen.getByRole("button", { name: "Save graph" }));
		fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
		await settle(() => second.resolve());
		expect(screen.getByTestId("dirty").textContent).toBe("Unsaved changes");
		expect(
			screen.getByRole("status", { name: "Persistence status" }).textContent,
		).toContain("Cancelled");
	});

	test("ABA record loads ignore both stale record completions and stale saves", async () => {
		const save = pending<void>();
		const beta = pending<GraphDocument>();
		const alpha = pending<GraphDocument>();
		const load = vi
			.fn<FlowPersistence["load"]>()
			.mockReturnValueOnce(beta.promise)
			.mockReturnValueOnce(alpha.promise);
		render(<FlowExample persistence={{ save: () => save.promise, load }} />);
		await ready(primary());
		editPrimary("Pending save");
		fireEvent.click(screen.getByRole("button", { name: "Save graph" }));
		fireEvent.click(screen.getByRole("button", { name: "Switch record" }));
		fireEvent.click(screen.getByRole("button", { name: "Switch record" }));
		await settle(() => {
			beta.resolve(graph("Stale beta"));
			save.resolve();
		});
		expect(screen.getByTestId("graph-json").textContent).not.toContain(
			"Stale beta",
		);
		expect(
			screen.getByRole("status", { name: "Persistence status" }).textContent,
		).toBe("Loading");
		await settle(() => alpha.resolve(graph("Current alpha")));
		expect(screen.getByTestId("graph-json").textContent).toContain(
			"Current alpha",
		);
		expect(
			screen.getByRole("status", { name: "Persistence status" }).textContent,
		).toBe("Loaded");
	});

	test("late load does not overwrite edits made after selecting a record", async () => {
		const load = pending<GraphDocument>();
		render(
			<FlowExample
				persistence={{ save: async () => {}, load: () => load.promise }}
			/>,
		);
		await ready(primary());
		fireEvent.click(screen.getByRole("button", { name: "Switch record" }));
		await ready(primary());
		fireEvent.click(
			within(primary()).getByRole("button", {
				name: "Other record (other)",
			}),
		);
		fireEvent.change(within(primary()).getByLabelText("Node label"), {
			target: { value: "Edited while loading" },
		});
		fireEvent.click(
			within(primary()).getByRole("button", { name: "Rename selected node" }),
		);
		await settle(() => load.resolve(graph("Late remote value")));
		expect(screen.getByTestId("graph-json").textContent).toContain(
			"Edited while loading",
		);
		expect(screen.getByTestId("graph-json").textContent).not.toContain(
			"Late remote value",
		);
		expect(screen.getByTestId("dirty").textContent).toBe("Unsaved changes");
	});

	test("hidden or unmounted editor lifetimes cannot be marked clean by an old save", async () => {
		const first = pending<void>();
		const second = pending<void>();
		const save = vi
			.fn<FlowPersistence["save"]>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const view = render(
			<FlowExample persistence={{ save, load: async () => graph() }} />,
		);
		await ready(primary());
		editPrimary("Keep dirty");
		fireEvent.click(screen.getByRole("button", { name: "Save graph" }));
		fireEvent.click(screen.getByRole("button", { name: "Toggle editor" }));
		await settle(() => first.resolve());
		expect(screen.getByTestId("dirty").textContent).toBe("Unsaved changes");
		fireEvent.click(screen.getByRole("button", { name: "Toggle editor" }));
		await ready(primary());
		fireEvent.click(screen.getByRole("button", { name: "Save graph" }));
		view.unmount();
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		await settle(() => second.resolve());
		expect(errors).not.toHaveBeenCalled();
	});

	test("a current successful save clears dirty state", async () => {
		const saved = pending<void>();
		render(
			<FlowExample
				persistence={{ save: () => saved.promise, load: async () => graph() }}
			/>,
		);
		await ready(primary());
		editPrimary("Ready to save");
		fireEvent.click(screen.getByRole("button", { name: "Save graph" }));
		await settle(() => saved.resolve());
		await waitFor(() =>
			expect(screen.getByTestId("dirty").textContent).toBe("Clean"),
		);
		expect(
			screen.getByRole("status", { name: "Persistence status" }).textContent,
		).toBe("Saved");
	});
});
