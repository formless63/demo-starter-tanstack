import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import {
	parseRichTextDocument,
	type RichTextDocument,
	richTextLimits,
} from "../../../src/integrations/rich-text/document";
import { RichTextExample } from "../../../src/integrations/rich-text/Example";
import { documentFromEditor } from "../../../src/integrations/rich-text/editor.client";
import { RichTextEditor } from "../../../src/integrations/rich-text/RichText";

import { allFeatures } from "./fixtures-data";

const documentWith = (text: string): RichTextDocument => ({
	type: "doc",
	content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
async function editorNamed(name = "Document") {
	const element = await screen.findByRole("textbox", { name });
	const editor = (element as HTMLElement & { editor: Editor }).editor;
	expect(editor).toBeDefined();
	return { element, editor };
}
function selectAll(editor: Editor) {
	act(() => {
		editor.commands.selectAll();
	});
}
function paste(
	element: HTMLElement,
	text: string,
	html = "<b>Untrusted HTML</b>",
) {
	const getData = vi.fn((format: string) =>
		format === "text/plain" ? text : html,
	);
	fireEvent.paste(element, { clipboardData: { getData, files: [] } });
	expect(getData).toHaveBeenCalledWith("text/plain");
}
function readValue(): RichTextDocument {
	return JSON.parse(
		screen.getByLabelText("Document JSON").textContent ?? "null",
	) as RichTextDocument;
}
function button(name: string) {
	return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function Controlled({
	initial = documentWith("Hello"),
	onChange = () => {},
}: {
	initial?: RichTextDocument;
	onChange?: (value: RichTextDocument) => void;
}) {
	const [value, setValue] = useState(initial);
	return (
		<>
			<RichTextEditor
				documentKey="test-document"
				value={value}
				onChange={(next) => {
					onChange(next);
					setValue(next);
				}}
				label="Article"
			/>
			<output aria-label="Document JSON">{JSON.stringify(value)}</output>
		</>
	);
}

describe("real Tiptap editor and controlled parent state", () => {
	test("pastes literal plain text, accepts a synchronous controlled update, and keeps formatting out of the HTML clipboard", async () => {
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);
		const { element, editor } = await editorNamed("Article");
		expect(element.getAttribute("contenteditable")).toBe("true");
		expect(element.getAttribute("aria-multiline")).toBe("true");
		selectAll(editor);
		paste(element, '<img src=x onerror="alert(1)"> & accepted');
		expect(element.textContent).toBe(
			'<img src=x onerror="alert(1)"> & accepted',
		);
		expect(element.querySelector("img,b,script")).toBeNull();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(readValue()).toEqual(
			documentWith('<img src=x onerror="alert(1)"> & accepted'),
		);
		expect(parseRichTextDocument(onChange.mock.calls[0][0])).toEqual(
			readValue(),
		);
	});

	test.each([
		["Bold", "strong", "bold"],
		["Italic", "em", "italic"],
		["Strike", "s", "strike"],
		["Inline code", "code", "code"],
	])("toolbar applies and removes %s through actual transactions", async (name, tag, mark) => {
		render(<Controlled />);
		const { element, editor } = await editorNamed("Article");
		selectAll(editor);
		fireEvent.click(button(name));
		expect(element.querySelector(tag)?.textContent).toBe("Hello");
		expect(button(name).getAttribute("aria-pressed")).toBe("true");
		expect(readValue().content[0].content?.[0].marks).toEqual([{ type: mark }]);
		fireEvent.click(button(name));
		expect(element.querySelector(tag)).toBeNull();
		expect(button(name).getAttribute("aria-pressed")).toBe("false");
		expect(readValue()).toEqual(documentWith("Hello"));
	});

	test.each([
		["Heading", "h2", "heading"],
		["Bullet list", "ul > li > p", "bulletList"],
		["Ordered list", "ol > li > p", "orderedList"],
		["Quote", "blockquote > p", "blockquote"],
		["Code block", "pre > code", "codeBlock"],
	])("toolbar toggles %s within the supported block schema", async (name, selector, node) => {
		render(<Controlled />);
		const { element, editor } = await editorNamed("Article");
		selectAll(editor);
		fireEvent.click(button(name));
		expect(element.querySelector(selector)?.textContent).toBe("Hello");
		expect(readValue().content[0].type).toBe(node);
		expect(button(name).getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(button(name));
		expect(readValue()).toEqual(documentWith("Hello"));
	});

	test("mounts the full supported schema with nested lists, headings, marks and code without unsolicited changes", async () => {
		const onChange = vi.fn();
		render(<Controlled initial={allFeatures} onChange={onChange} />);
		const { element, editor } = await editorNamed("Article");
		expect(documentFromEditor(editor.getJSON())).toEqual(
			parseRichTextDocument(allFeatures),
		);
		expect(element.querySelector("h1")?.textContent).toBe("Heading 1");
		expect(element.querySelector("h3")?.textContent).toBe("Heading 3");
		expect(element.querySelector("ol")?.getAttribute("start")).toBe("3");
		expect(element.querySelector("ol ul li")?.textContent).toBe("nested");
		expect(element.querySelector("pre")?.textContent).toBe(
			"<script>literal</script>\nconst n = 1;",
		);
		expect(element.querySelector("script,img,iframe")).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
		expect(button("Undo").disabled).toBe(true);
	});

	test("adjacent equivalent text nodes mount without a normalization loop and preserve history", async () => {
		const initial: RichTextDocument = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Hel" },
						{ type: "text", text: "lo" },
					],
				},
			],
		};
		const onChange = vi.fn();
		render(<Controlled initial={initial} onChange={onChange} />);
		const { element, editor } = await editorNamed("Article");
		expect(element.textContent).toBe("Hello");
		expect(onChange).not.toHaveBeenCalled();
		selectAll(editor);
		paste(element, "Normalized edit");
		expect(readValue()).toEqual(documentWith("Normalized edit"));
		expect(button("Undo").disabled).toBe(false);
		fireEvent.click(button("Undo"));
		expect(element.textContent).toBe("Hello");
	});

	test("mixed marks normalize once, preserve history, and update through the real editor", async () => {
		const initial: RichTextDocument = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "Mixed",
							marks: [
								{ type: "strike" },
								{ type: "italic" },
								{ type: "link", attrs: { href: "https://example.test" } },
								{ type: "bold" },
							],
						},
					],
				},
			],
		};
		const onChange = vi.fn();
		render(<Controlled initial={initial} onChange={onChange} />);
		const { element, editor } = await editorNamed("Article");
		expect(onChange).not.toHaveBeenCalled();
		expect(element.querySelector("a strong em s")?.textContent).toBe("Mixed");
		selectAll(editor);
		fireEvent.click(button("Bold"));
		expect(
			readValue().content[0].content?.[0].marks?.map((mark) => mark.type),
		).toEqual(["link", "italic", "strike"]);
		expect(button("Undo").disabled).toBe(false);
		fireEvent.click(button("Undo"));
		expect(
			readValue().content[0].content?.[0].marks?.map((mark) => mark.type),
		).toEqual(["link", "bold", "italic", "strike"]);
		expect(button("Redo").disabled).toBe(false);
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	test("keyboard Enter and Shift+Enter emit supported paragraphs and hard breaks", async () => {
		render(<Controlled />);
		const { element, editor } = await editorNamed("Article");
		act(() => {
			editor.commands.setTextSelection(6);
		});
		fireEvent.keyDown(element, {
			key: "Enter",
			code: "Enter",
			keyCode: 13,
			shiftKey: true,
		});
		expect(readValue().content[0].content?.[1]).toEqual({ type: "hardBreak" });
		fireEvent.keyDown(element, { key: "Enter", code: "Enter", keyCode: 13 });
		expect(readValue().content).toHaveLength(2);
		expect(readValue().content[1].type).toBe("paragraph");
	});

	test("rejects unsafe links visibly, applies a safe link, and removes it", async () => {
		render(<Controlled />);
		const { element, editor } = await editorNamed("Article");
		selectAll(editor);
		fireEvent.change(screen.getByLabelText("Link URL"), {
			target: { value: "javascript:alert(1)" },
		});
		fireEvent.click(button("Apply link"));
		expect(screen.getByRole("alert").textContent).toContain(
			"absolute HTTP, HTTPS or mailto",
		);
		expect(screen.getByLabelText("Link URL").getAttribute("aria-invalid")).toBe(
			"true",
		);
		expect(element.querySelector("a")).toBeNull();
		expect(readValue()).toEqual(documentWith("Hello"));
		fireEvent.change(screen.getByLabelText("Link URL"), {
			target: { value: "https://example.test/help" },
		});
		fireEvent.click(button("Apply link"));
		expect(element.querySelector("a")?.getAttribute("href")).toBe(
			"https://example.test/help",
		);
		expect(element.querySelector("a")?.getAttribute("rel")).toBe(
			"noopener noreferrer nofollow",
		);
		expect(element.querySelector("a")?.getAttribute("target")).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
		fireEvent.click(button("Remove link"));
		expect(element.querySelector("a")).toBeNull();
		expect(readValue()).toEqual(documentWith("Hello"));
	});

	test("accepted edits support native undo/redo with correct disabled state", async () => {
		render(<Controlled />);
		const { element, editor } = await editorNamed("Article");
		expect(button("Undo").disabled).toBe(true);
		expect(button("Redo").disabled).toBe(true);
		selectAll(editor);
		paste(element, "Accepted edit");
		expect(button("Undo").disabled).toBe(false);
		fireEvent.click(button("Undo"));
		expect(element.textContent).toBe("Hello");
		expect(readValue()).toEqual(documentWith("Hello"));
		expect(button("Redo").disabled).toBe(false);
		fireEvent.click(button("Redo"));
		expect(element.textContent).toBe("Accepted edit");
		expect(readValue()).toEqual(documentWith("Accepted edit"));
		expect(button("Redo").disabled).toBe(true);
	});

	test("parent rejection restores authoritative content and clears prior undo/redo", async () => {
		render(<RichTextExample />);
		const { element, editor } = await editorNamed();
		selectAll(editor);
		paste(element, "Accepted baseline");
		expect(button("Undo").disabled).toBe(false);
		fireEvent.click(button("Reject changes"));
		selectAll(editor);
		paste(element, "Rejected secret text");
		expect(element.textContent).toBe("Accepted baseline");
		expect(readValue()).toEqual(documentWith("Accepted baseline"));
		expect(button("Undo").disabled).toBe(true);
		expect(button("Redo").disabled).toBe(true);
		expect(editor.can().undo()).toBe(false);
		expect(editor.can().redo()).toBe(false);
		fireEvent.click(button("Accept changes"));
		selectAll(editor);
		paste(element, "Accepted after rejection");
		fireEvent.click(button("Undo"));
		expect(element.textContent).toBe("Accepted baseline");
		expect(element.textContent).not.toContain("Rejected");
	});

	test("external replacement cannot recover old or rejected content with history", async () => {
		render(<RichTextExample />);
		const { element, editor } = await editorNamed();
		selectAll(editor);
		paste(element, "Old confidential document");
		fireEvent.click(button("Undo"));
		expect(button("Redo").disabled).toBe(false);
		fireEvent.click(button("Replace document"));
		expect(element.textContent).toBe("Replacement document");
		expect(readValue()).toEqual(documentWith("Replacement document"));
		expect(button("Undo").disabled).toBe(true);
		expect(button("Redo").disabled).toBe(true);
		expect(editor.can().undo()).toBe(false);
		expect(editor.can().redo()).toBe(false);
		selectAll(editor);
		paste(element, "New revision");
		fireEvent.click(button("Undo"));
		expect(element.textContent).toBe("Replacement document");
	});

	test("read-only mode removes the editor and remount preserves only accepted value", async () => {
		render(<RichTextExample />);
		const { element, editor } = await editorNamed();
		selectAll(editor);
		paste(element, "Persisted value");
		fireEvent.click(button("Toggle read only"));
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(
			screen.queryByRole("group", { name: "Document formatting" }),
		).toBeNull();
		expect(screen.getByRole("region", { name: "Document" }).textContent).toBe(
			"Persisted value",
		);
		await waitFor(() => expect(editor.isDestroyed).toBe(true));
		fireEvent.click(button("Toggle read only"));
		const remounted = await editorNamed();
		expect(remounted.editor).not.toBe(editor);
		expect(remounted.element.textContent).toBe("Persisted value");
		expect(button("Undo").disabled).toBe(true);
		fireEvent.click(button("Toggle editor"));
		expect(screen.queryByRole("textbox")).toBeNull();
		await waitFor(() => expect(remounted.editor.isDestroyed).toBe(true));
		fireEvent.click(button("Toggle editor"));
		expect((await editorNamed()).element.textContent).toBe("Persisted value");
	});

	test("filters oversized actual transactions without emitting or changing parent state", async () => {
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);
		const { element, editor } = await editorNamed("Article");
		selectAll(editor);
		paste(element, "a".repeat(richTextLimits.characters + 1));
		expect(element.textContent).toBe("Hello");
		expect(onChange).not.toHaveBeenCalled();
		act(() => {
			editor.commands.insertContent("界".repeat(90_000));
		});
		expect(element.textContent).toBe("Hello");
		expect(onChange).not.toHaveBeenCalled();
		act(() => {
			editor.commands.insertContent(
				Array.from({ length: richTextLimits.nodes }, () => ({
					type: "paragraph",
				})),
			);
		});
		expect(element.textContent).toBe("Hello");
		expect(onChange).not.toHaveBeenCalled();
	});

	test("empty, HTML-only and file-only paste never deletes selected content", async () => {
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);
		const { element, editor } = await editorNamed("Article");
		for (const files of [
			[],
			[new File(["image"], "image.png", { type: "image/png" })],
		]) {
			selectAll(editor);
			const getData = vi.fn((format: string) =>
				format === "text/html"
					? '<img src="https://example.test/image"><b>HTML-only</b>'
					: "",
			);
			expect(
				fireEvent.paste(element, { clipboardData: { getData, files } }),
			).toBe(false);
			expect(element.textContent).toBe("Hello");
			expect(element.querySelector("img,b,strong")).toBeNull();
			expect(readValue()).toEqual(documentWith("Hello"));
		}
		selectAll(editor);
		paste(element, "", "");
		expect(element.textContent).toBe("Hello");
		expect(onChange).not.toHaveBeenCalled();
		expect(button("Undo").disabled).toBe(true);
	});

	test("drops are blocked and do not import HTML, images, or files", async () => {
		const onChange = vi.fn();
		render(<Controlled onChange={onChange} />);
		const { element, editor } = await editorNamed("Article");
		vi.spyOn(editor.view, "posAtCoords").mockReturnValue({
			pos: 1,
			inside: -1,
		});
		const drop = new Event("drop", { bubbles: true, cancelable: true });
		Object.defineProperty(drop, "dataTransfer", {
			value: {
				getData: () => '<img src="https://example.test/tracker">',
				files: [new File(["image"], "image.png", { type: "image/png" })],
			},
		});
		fireEvent(element, drop);
		expect(drop.defaultPrevented).toBe(true);
		expect(element.textContent).toBe("Hello");
		expect(element.querySelector("img")).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
	});

	test("label and latest callback update without keeping stale parent closures", async () => {
		const oldCallback = vi.fn();
		const nextCallback = vi.fn();
		const value = documentWith("Hello");
		const { rerender } = render(
			<RichTextEditor
				documentKey="test-document"
				value={value}
				onChange={oldCallback}
				label="Old label"
			/>,
		);
		const { editor } = await editorNamed("Old label");
		rerender(
			<RichTextEditor
				documentKey="test-document"
				value={value}
				onChange={nextCallback}
				label="New label"
			/>,
		);
		const element = screen.getByRole("textbox", { name: "New label" });
		expect(
			within(
				screen.getByRole("group", { name: "New label formatting" }),
			).getByRole("button", { name: "Bold" }),
		).toBeDefined();
		selectAll(editor);
		paste(element, "Attempt");
		expect(oldCallback).not.toHaveBeenCalled();
		expect(nextCallback).toHaveBeenCalledTimes(1);
		expect(element.textContent).toBe("Hello");
	});

	test("editor-generated defaults are removed but unsupported nodes and unsafe links still fail validation", () => {
		expect(
			documentFromEditor({
				type: "doc",
				content: [
					{
						type: "paragraph",
						attrs: {},
						content: [
							{
								type: "text",
								text: "Linked",
								marks: [
									{
										type: "link",
										attrs: {
											href: "https://example.test",
											target: "_blank",
											rel: "nofollow",
											class: null,
										},
									},
								],
							},
						],
					},
				],
			}),
		).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "Linked",
							marks: [
								{ type: "link", attrs: { href: "https://example.test" } },
							],
						},
					],
				},
			],
		});
		expect(() =>
			documentFromEditor({
				type: "doc",
				content: [
					{ type: "image", attrs: { src: "https://example.test/image" } },
				],
			}),
		).toThrow();
		expect(() =>
			documentFromEditor({
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{
								type: "text",
								text: "bad",
								marks: [
									{ type: "link", attrs: { href: "javascript:alert(1)" } },
								],
							},
						],
					},
				],
			}),
		).toThrow();
	});
});

describe("canonical text and explicit record identity", () => {
	test("normalizes clipboard line endings, preserves Unicode and keeps accepted undo/redo", async () => {
		render(<Controlled />);
		const { editor, element } = await editorNamed("Article");
		selectAll(editor);
		paste(element, "One\r\nTwo\rThree 😀 �");
		const canonical = "One\nTwo\nThree 😀 �";
		expect(editor.state.doc.textContent).toBe(canonical);
		expect(readValue()).toEqual(documentWith(canonical));
		fireEvent.click(button("Undo"));
		expect(element.textContent).toBe("Hello");
		fireEvent.click(button("Redo"));
		expect(editor.state.doc.textContent).toBe(canonical);
		for (const bad of ["\0", "\ud800", "\udfff"]) {
			selectAll(editor);
			paste(element, bad);
			expect(editor.state.doc.textContent).toBe(canonical);
			act(() => {
				editor.commands.insertContent({ type: "text", text: bad });
			});
			expect(editor.state.doc.textContent).toBe(canonical);
		}
		selectAll(editor);
		act(() => {
			editor.commands.insertContent({
				type: "text",
				text: "uncanonical\rtext",
			});
		});
		expect(editor.state.doc.textContent).toBe(canonical);
		fireEvent.click(button("Undo"));
		expect(element.textContent).toBe("Hello");
	});
	test("parent rejection restores the canonical document and clears rejected text history", async () => {
		render(<RichTextExample />);
		const { editor, element } = await editorNamed();
		selectAll(editor);
		paste(element, "Saved\r\ntext 😀 �");
		fireEvent.click(button("Reject changes"));
		selectAll(editor);
		paste(element, "Rejected\rsecret");
		expect(editor.state.doc.textContent).toBe("Saved\ntext 😀 �");
		expect(readValue()).toEqual(documentWith("Saved\ntext 😀 �"));
		expect(button("Undo").disabled).toBe(true);
		expect(button("Redo").disabled).toBe(true);
		act(() => {
			editor.commands.undo();
			editor.commands.redo();
		});
		expect(element.textContent).toBe("Saved\ntext 😀 �");
	});
	test("stable-key cloned echoes retain undo but a new-key equal Public document cannot recover PRIVATE", async () => {
		function Owner({ documentKey }: { documentKey: string }) {
			const [value, setValue] = useState(documentWith("PRIVATE"));
			return (
				<RichTextEditor
					documentKey={documentKey}
					label="Article"
					value={value}
					onChange={(next) => setValue(structuredClone(next))}
				/>
			);
		}
		const view = render(<Owner documentKey="private-record" />);
		const original = await editorNamed("Article");
		selectAll(original.editor);
		paste(original.element, "Public");
		expect(button("Undo").disabled).toBe(false);
		fireEvent.click(button("Undo"));
		expect(original.element.textContent).toBe("PRIVATE");
		fireEvent.click(button("Redo"));
		expect(original.element.textContent).toBe("Public");
		view.rerender(<Owner documentKey="public-record" />);
		// A late event on the retired instance cannot change the new record.
		act(() => {
			if (!original.editor.isDestroyed)
				original.editor.commands.insertContent("PRIVATE");
		});
		await waitFor(() => expect(original.editor.isDestroyed).toBe(true));
		const next = await editorNamed("Article");
		expect(next.editor).not.toBe(original.editor);
		expect(next.element.textContent).toBe("Public");
		expect(button("Undo").disabled).toBe(true);
		expect(button("Redo").disabled).toBe(true);
		act(() => {
			next.editor.commands.undo();
			next.editor.commands.redo();
		});
		expect(next.element.textContent).toBe("Public");
	});
});
