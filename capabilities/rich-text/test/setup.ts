import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(cleanup);

// jsdom has no layout. These shims only unblock ProseMirror's selection scrolling;
// all transactions, schema validation, plugins, history and React code stay real.
if (typeof Range !== "undefined") {
	Range.prototype.getBoundingClientRect = () => new DOMRect();
	Range.prototype.getClientRects = () =>
		Object.assign([], { item: () => null });
	Element.prototype.getBoundingClientRect = () => new DOMRect();
}
