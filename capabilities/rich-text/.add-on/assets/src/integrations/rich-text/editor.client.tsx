// Loaded only after mount by RichText.tsx. Never import this entry from server code.

import { AllSelection, EditorState, Plugin, Selection } from "@tiptap/pm/state";
import {
	EditorContent,
	Extension,
	type JSONContent,
	useEditor,
	useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useId, useLayoutEffect, useRef, useState } from "react";
import {
	isSafeRichTextLink,
	parseRichTextDocument,
	type RichTextDocument,
	richTextLimits,
} from "./document";
import type { RichTextEditorProps } from "./RichText";
/** Drop only editor-generated defaults; public input always uses the strict parser. */
export function documentFromEditor(input: JSONContent): RichTextDocument {
	function copy(item: JSONContent): unknown {
		return {
			type: item.type,
			...(item.text === undefined ? {} : { text: item.text }),
			...(item.type === "heading"
				? { attrs: { level: item.attrs?.level } }
				: item.type === "orderedList"
					? { attrs: { start: item.attrs?.start } }
					: {}),
			...(item.marks?.length
				? {
						marks: item.marks.map((mark) =>
							mark.type === "link"
								? { type: mark.type, attrs: { href: mark.attrs?.href } }
								: { type: mark.type },
						),
					}
				: {}),
			...(item.content?.length ? { content: item.content.map(copy) } : {}),
		};
	}
	return parseRichTextDocument(copy(input));
}
const bounds = Extension.create({
	name: "boundedDocument",
	addProseMirrorPlugins() {
		return [
			new Plugin({
				filterTransaction(transaction) {
					if (!transaction.docChanged) return true;
					try {
						documentFromEditor(transaction.doc.toJSON());
						return true;
					} catch {
						return false;
					}
				},
			}),
		];
	},
});
export function ClientEditor({
	value,
	onChange,
	label,
	readOnly = false,
}: RichTextEditorProps) {
	const current = useRef({ value, onChange });
	current.current = { value, onChange };
	const [, render] = useState(0);
	const [link, setLink] = useState("");
	const [linkError, setLinkError] = useState(false);
	const linkId = useId();
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
				horizontalRule: false,
				underline: false,
				trailingNode: false,
				link: {
					openOnClick: false,
					autolink: false,
					linkOnPaste: false,
					isAllowedUri: isSafeRichTextLink,
					HTMLAttributes: { target: null, rel: "noopener noreferrer nofollow" },
				},
			}),
			bounds,
		],
		content: value,
		immediatelyRender: false,
		editable: !readOnly,
		injectCSS: false,
		editorProps: {
			attributes: {
				role: "textbox",
				"aria-label": label,
				"aria-multiline": "true",
				class: "min-h-40 rounded border p-3 outline-offset-2",
				style: "white-space: pre-wrap; overflow-wrap: anywhere;",
			},
			handlePaste(view, event) {
				event.preventDefault();
				const text = event.clipboardData?.getData("text/plain") ?? "";
				if (text.length > 0 && text.length <= richTextLimits.characters)
					view.dispatch(view.state.tr.insertText(text));
				return true;
			},
			handleDrop(_view, event) {
				event.preventDefault();
				return true;
			},
		},
		onUpdate({ editor: updated }) {
			try {
				current.current.onChange(documentFromEditor(updated.getJSON()));
			} finally {
				render((n) => n + 1);
			}
		},
	});
	const state = useEditorState({
		editor,
		selector: ({ editor: e }) => ({
			bold: e?.isActive("bold") ?? false,
			italic: e?.isActive("italic") ?? false,
			strike: e?.isActive("strike") ?? false,
			code: e?.isActive("code") ?? false,
			heading: e?.isActive("heading", { level: 2 }) ?? false,
			bulletList: e?.isActive("bulletList") ?? false,
			orderedList: e?.isActive("orderedList") ?? false,
			blockquote: e?.isActive("blockquote") ?? false,
			codeBlock: e?.isActive("codeBlock") ?? false,
			undo: e?.can().undo() ?? false,
			redo: e?.can().redo() ?? false,
		}),
	});
	// Every transaction requests a React render, even when the parent rejects it by
	// keeping the same value. External replacement/rejection creates a fresh state:
	// prior document data can never reappear through undo/redo.
	useLayoutEffect(() => {
		if (!editor) return;
		const expected = JSON.stringify(value);
		if (JSON.stringify(documentFromEditor(editor.getJSON())) !== expected) {
			const doc = editor.schema.nodeFromJSON(value);
			doc.check();
			editor.view.updateState(
				EditorState.create({
					schema: editor.schema,
					doc,
					plugins: editor.state.plugins,
				}),
			);
			render((n) => n + 1);
		}
		editor.setEditable(!readOnly, false);
		editor.setOptions({
			editorProps: {
				...editor.options.editorProps,
				attributes: {
					...editor.options.editorProps.attributes,
					"aria-label": label,
				},
			},
		});
	});
	if (!editor) return <output>Loading editor…</output>;
	const button = (name: string, pressed: boolean, run: () => void) => (
		<button
			type="button"
			aria-pressed={pressed}
			disabled={readOnly}
			onMouseDown={(event) => event.preventDefault()}
			onClick={() => {
				if (editor.state.selection instanceof AllSelection) {
					editor.commands.setTextSelection({
						from: Selection.atStart(editor.state.doc).from,
						to: Selection.atEnd(editor.state.doc).to,
					});
				}
				run();
			}}
		>
			{name}
		</button>
	);
	return (
		<div>
			<fieldset
				aria-label={`${label} formatting`}
				className="flex flex-wrap gap-2"
			>
				{button("Bold", state?.bold ?? false, () => {
					editor.chain().focus().toggleBold().run();
				})}
				{button("Italic", state?.italic ?? false, () => {
					editor.chain().focus().toggleItalic().run();
				})}
				{button("Strike", state?.strike ?? false, () => {
					editor.chain().focus().toggleStrike().run();
				})}
				{button("Inline code", state?.code ?? false, () => {
					editor.chain().focus().toggleCode().run();
				})}
				{button("Heading", state?.heading ?? false, () => {
					editor.chain().focus().toggleHeading({ level: 2 }).run();
				})}
				{button("Bullet list", state?.bulletList ?? false, () => {
					editor.chain().focus().toggleBulletList().run();
				})}
				{button("Ordered list", state?.orderedList ?? false, () => {
					editor.chain().focus().toggleOrderedList().run();
				})}
				{button("Quote", state?.blockquote ?? false, () => {
					editor.chain().focus().toggleBlockquote().run();
				})}
				{button("Code block", state?.codeBlock ?? false, () => {
					editor.chain().focus().toggleCodeBlock().run();
				})}
				<button
					type="button"
					disabled={readOnly || !state?.undo}
					onClick={() => editor.chain().focus().undo().run()}
				>
					Undo
				</button>
				<button
					type="button"
					disabled={readOnly || !state?.redo}
					onClick={() => editor.chain().focus().redo().run()}
				>
					Redo
				</button>
			</fieldset>
			<div>
				<label htmlFor={linkId}>Link URL</label>
				<input
					id={linkId}
					type="url"
					value={link}
					disabled={readOnly}
					onChange={(event) => {
						setLink(event.target.value);
						setLinkError(false);
					}}
					aria-invalid={linkError}
				/>
				<button
					type="button"
					disabled={readOnly}
					onClick={() => {
						if (!isSafeRichTextLink(link)) {
							setLinkError(true);
							return;
						}
						editor
							.chain()
							.focus()
							.extendMarkRange("link")
							.setLink({ href: link })
							.run();
						setLinkError(false);
					}}
				>
					Apply link
				</button>
				<button
					type="button"
					disabled={readOnly}
					onClick={() =>
						editor.chain().focus().extendMarkRange("link").unsetLink().run()
					}
				>
					Remove link
				</button>
				{linkError && (
					<p role="alert">
						Enter an absolute HTTP, HTTPS or mailto URL without credentials or
						whitespace.
					</p>
				)}
			</div>
			<EditorContent editor={editor} />
		</div>
	);
}
