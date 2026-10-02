import { useState } from "react";
import {
	RichTextContent,
	RichTextEditor,
} from "../.add-on/assets/src/integrations/rich-text/RichText";
import {
	parseRichTextDocument,
	type RichTextDocument,
} from "../.add-on/assets/src/integrations/rich-text/document";
const initial: RichTextDocument = {
	type: "doc",
	content: [
		{
			type: "paragraph",
			content: [{ type: "text", text: "One\r\nTwo\rThree 😀 �" }],
		},
	],
};
export function UnicodeExample() {
	const [value, setValue] = useState(initial);
	return (
		<main>
			<RichTextEditor
				documentKey="unicode-record"
				label="Unicode document"
				value={value}
				onChange={setValue}
			/>
			<RichTextContent label="Unicode preview" value={value} />
			<output aria-label="Canonical JSON">
				{JSON.stringify(parseRichTextDocument(value))}
			</output>
		</main>
	);
}
