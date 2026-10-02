// @vitest-environment node
import { renderToString } from "react-dom/server";
import { expect, test, vi } from "vitest";

// Importing the server-safe public boundary must never evaluate Tiptap.
vi.mock("../../../src/integrations/rich-text/editor.client", () => {
	throw new Error("Client editor imported on the server");
});

import { emptyRichTextDocument } from "../../../src/integrations/rich-text/document";
import {
	RichTextContent,
	RichTextEditor,
} from "../../../src/integrations/rich-text/RichText";

test("public SSR entry evaluates without window, document, or client-editor imports", () => {
	expect(typeof window).toBe("undefined");
	expect(typeof document).toBe("undefined");
	expect(
		renderToString(<RichTextContent value={emptyRichTextDocument} />),
	).toBe(
		'<section style="white-space:pre-wrap;overflow-wrap:anywhere"><div><p></p></div></section>',
	);
	expect(
		renderToString(
			<RichTextEditor
				documentKey="test-document"
				value={emptyRichTextDocument}
				onChange={() => {}}
				label="Server content"
			/>,
		),
	).toContain("Loading editor…");
	expect(
		renderToString(
			<RichTextEditor
				documentKey="test-document"
				value={emptyRichTextDocument}
				onChange={() => {}}
				label="Server content"
				readOnly
			/>,
		),
	).not.toContain("Loading editor");
});
