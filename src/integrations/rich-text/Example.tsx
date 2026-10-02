import { useState } from "react";
import type { RichTextDocument } from "./document";
import { RichTextContent, RichTextEditor } from "./RichText";

const initial: RichTextDocument = {
	type: "doc",
	content: [
		{ type: "paragraph", content: [{ type: "text", text: "Hello rich text" }] },
	],
};
export function RichTextExample() {
	const [value, setValue] = useState(initial);
	const [reject, setReject] = useState(false);
	const [visible, setVisible] = useState(true);
	const [readOnly, setReadOnly] = useState(false);
	return (
		<main>
			<h1>Rich text example</h1>
			<button type="button" onClick={() => setReject((v) => !v)}>
				{reject ? "Accept changes" : "Reject changes"}
			</button>
			<button type="button" onClick={() => setVisible((v) => !v)}>
				Toggle editor
			</button>
			<button type="button" onClick={() => setReadOnly((v) => !v)}>
				Toggle read only
			</button>
			<button
				type="button"
				onClick={() =>
					setValue({
						type: "doc",
						content: [
							{
								type: "paragraph",
								content: [{ type: "text", text: "Replacement document" }],
							},
						],
					})
				}
			>
				Replace document
			</button>
			{visible && (
				<RichTextEditor
					label="Document"
					value={value}
					onChange={(next) => {
						if (!reject) setValue(next);
					}}
					readOnly={readOnly}
				/>
			)}
			<RichTextContent value={value} label="Preview" />
			<output aria-label="Document JSON">{JSON.stringify(value)}</output>
		</main>
	);
}
