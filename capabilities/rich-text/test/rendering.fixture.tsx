import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { RichTextDocument } from "../../../src/integrations/rich-text/document";
import {
	RichTextContent,
	RichTextEditor,
} from "../../../src/integrations/rich-text/RichText";
import { allFeatures } from "./fixtures-data";

const literal: RichTextDocument = {
	type: "doc",
	content: [
		{
			type: "paragraph",
			content: [
				{
					type: "text",
					text: '<img src=x onerror="alert(1)"><script>secret()</script>& literal',
				},
			],
		},
	],
};

describe("safe React renderer and genuine hydration", () => {
	test("renders all v1 structures and safe links semantically", () => {
		const { container } = render(
			<RichTextContent value={allFeatures} label="Published content" />,
		);
		expect(
			screen.getByRole("region", { name: "Published content" }),
		).toBeDefined();
		for (const level of [1, 2, 3])
			expect(
				screen.getByRole("heading", { level, name: `Heading ${level}` }),
			).toBeDefined();
		for (const [tag, text] of [
			["strong", "bold"],
			["em", "italic"],
			["s", "strike"],
			["code", "code"],
			["blockquote", "quote"],
			["pre", "<script>literal</script>"],
		])
			expect(container.querySelector(tag)?.textContent).toContain(text);
		expect(container.querySelector("br")).not.toBeNull();
		expect(container.querySelector("ol")?.getAttribute("start")).toBe("3");
		expect(container.querySelectorAll("li")).toHaveLength(3);
		const link = screen.getByRole("link", { name: "linked" });
		expect(link.getAttribute("href")).toBe(
			"https://example.test/path?q=yes#anchor",
		);
		expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow");
		expect(link.getAttribute("target")).toBeNull();
		expect(container.querySelector("script")).toBeNull();
	});

	test("treats user HTML as escaped literal text both on the server and client", () => {
		const html = renderToString(<RichTextContent value={literal} />);
		expect(html).toContain("&lt;img");
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<img");
		const { container } = render(<RichTextContent value={literal} />);
		expect(container.textContent).toBe(literal.content[0].content?.[0].text);
		expect(container.querySelector("img,script,iframe,style")).toBeNull();
	});

	test("invalid content fails closed with no payload, unsafe element or URL", () => {
		const unsafe = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "private payload",
							marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
						},
					],
				},
			],
		} as RichTextDocument;
		const { container, rerender } = render(<RichTextContent value={unsafe} />);
		expect(screen.getByRole("alert").textContent).toBe(
			"Invalid rich-text document.",
		);
		expect(container.textContent).not.toContain("private payload");
		expect(container.querySelector("a")).toBeNull();
		rerender(
			<RichTextEditor
				documentKey="test-document"
				value={unsafe}
				onChange={vi.fn()}
				label="Unsafe editor"
			/>,
		);
		expect(screen.getByRole("alert").textContent).toBe(
			"Invalid rich-text document.",
		);
		expect(screen.queryByRole("textbox")).toBeNull();
	});

	test("SSR contains only safe content and a loading status, never editor markup", () => {
		const html = renderToString(
			<RichTextEditor
				documentKey="test-document"
				value={literal}
				onChange={vi.fn()}
				label="Article"
			/>,
		);
		const safe = renderToString(
			<RichTextContent value={literal} label="Article" />,
		);
		expect(html).toBe(
			`<div aria-busy="true">${safe}<output>Loading editor…</output></div>`,
		);
		expect(html).not.toMatch(
			/contenteditable|ProseMirror|role="textbox"|formatting/,
		);
	});

	test("hydrateRoot starts from the escaped SSR boundary without mismatch, then mounts the real client editor", async () => {
		const container = document.createElement("div");
		const onChange = vi.fn();
		const component = (
			<RichTextEditor
				documentKey="test-document"
				value={literal}
				onChange={onChange}
				label="Hydrated article"
			/>
		);
		container.innerHTML = renderToString(component);
		const serverMarkup = container.innerHTML;
		document.body.append(container);
		const recoverable = vi.fn();
		const errors = vi.spyOn(console, "error");
		let root: Root | undefined;
		try {
			root = hydrateRoot(container, component, {
				onRecoverableError: recoverable,
			});
			// hydrateRoot has not flushed effects yet; the SSR boundary is still exact.
			expect(container.innerHTML).toBe(serverMarkup);
			await act(async () => {
				await Promise.resolve();
			});
			await waitFor(() =>
				expect(container.querySelector('[role="textbox"]')).not.toBeNull(),
			);
			expect(container.querySelector('[role="textbox"]')?.textContent).toBe(
				literal.content[0].content?.[0].text,
			);
			expect(container.querySelector("img,script,iframe")).toBeNull();
			expect(recoverable).not.toHaveBeenCalled();
			expect(errors.mock.calls.flat().join(" ")).not.toMatch(
				/hydration|did not match|server rendered/i,
			);
			expect(onChange).not.toHaveBeenCalled();
		} finally {
			await act(async () => root?.unmount());
			container.remove();
		}
	});

	test("read-only SSR equals the safe renderer and hydration never adds editing controls", async () => {
		const component = (
			<RichTextEditor
				documentKey="test-document"
				value={allFeatures}
				onChange={vi.fn()}
				label="Read only"
				readOnly
			/>
		);
		const container = document.createElement("div");
		container.innerHTML = renderToString(component);
		expect(renderToString(component)).toBe(
			renderToString(<RichTextContent value={allFeatures} label="Read only" />),
		);
		document.body.append(container);
		const recoverable = vi.fn();
		let root: Root | undefined;
		try {
			await act(async () => {
				root = hydrateRoot(container, component, {
					onRecoverableError: recoverable,
				});
			});
			expect(
				container.querySelector("[contenteditable],button,input"),
			).toBeNull();
			expect(container.querySelector("h3")?.textContent).toBe("Heading 3");
			expect(recoverable).not.toHaveBeenCalled();
		} finally {
			await act(async () => root?.unmount());
			container.remove();
		}
	});

	test("unmounts safely before the asynchronous client import resolves", async () => {
		const onChange = vi.fn();
		const { unmount, container } = render(
			<RichTextEditor
				documentKey="test-document"
				value={literal}
				onChange={onChange}
				label="Quick removal"
			/>,
		);
		unmount();
		await act(async () => {
			await Promise.resolve();
		});
		expect(container.innerHTML).toBe("");
		expect(onChange).not.toHaveBeenCalled();
	});
});

test("SSR content preserves plain-text spaces and line breaks without editor CSS", () => {
	const html = renderToString(
		<RichTextContent
			value={{
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [{ type: "text", text: "one  two\nthree" }],
					},
				],
			}}
		/>,
	);
	expect(html).toContain("white-space:pre-wrap");
	expect(html).toContain("one  two\nthree");
});

test.each([
	"",
	undefined,
	null,
])("missing or empty document identity %j fails closed", (documentKey) => {
	const html = renderToString(
		<RichTextEditor
			documentKey={documentKey as unknown as string}
			value={literal}
			label="Article"
			onChange={vi.fn()}
		/>,
	);
	expect(html).toContain("Invalid rich-text document identity.");
	expect(html).not.toContain("Loading editor");
});
