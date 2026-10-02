import { createClientOnlyFn } from "@tanstack/react-start";
import {
	type ComponentType,
	createElement,
	type ReactNode,
	useEffect,
	useState,
} from "react";
import {
	parseRichTextDocument,
	type RichTextDocument,
	type RichTextNode,
} from "./document";

const loadEditor = createClientOnlyFn(() => import("./editor.client"));

export type RichTextEditorProps = {
	/** Stable caller-owned record identity. Change to discard selection/history, even for equal JSON. */
	documentKey: string;
	value: RichTextDocument;
	onChange: (value: RichTextDocument) => void;
	label: string;
	readOnly?: boolean;
};
function renderNode(node: RichTextNode, key: number): ReactNode {
	if (node.type === "text") {
		let text: ReactNode = node.text;
		for (const mark of node.marks ?? [])
			text =
				mark.type === "link" ? (
					<a href={mark.attrs.href} rel="noopener noreferrer nofollow">
						{text}
					</a>
				) : (
					createElement(
						(
							{
								bold: "strong",
								italic: "em",
								strike: "s",
								code: "code",
							} as const
						)[mark.type],
						null,
						text,
					)
				);
		return <span key={key}>{text}</span>;
	}
	const children = node.content?.map(renderNode);
	if (node.type === "doc") return <div key={key}>{children}</div>;
	if (node.type === "codeBlock")
		return (
			<pre key={key}>
				<code>{children}</code>
			</pre>
		);
	const tag =
		node.type === "heading"
			? `h${node.attrs?.level}`
			: (
					{
						paragraph: "p",
						blockquote: "blockquote",
						bulletList: "ul",
						orderedList: "ol",
						listItem: "li",
						hardBreak: "br",
					} as Record<string, string>
				)[node.type];
	return createElement(
		tag,
		{
			key,
			...(node.type === "orderedList" ? { start: node.attrs?.start } : {}),
		},
		children,
	);
}
export function RichTextContent({
	value,
	label,
}: {
	value: RichTextDocument;
	label?: string;
}) {
	try {
		return (
			<section
				aria-label={label}
				style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
			>
				{renderNode(parseRichTextDocument(value), 0)}
			</section>
		);
	} catch {
		return <p role="alert">Invalid rich-text document.</p>;
	}
}
/** SSR and first hydration pass render exactly the same safe read-only content. */
export function RichTextEditor(props: RichTextEditorProps) {
	const [Client, setClient] =
		useState<ComponentType<RichTextEditorProps> | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let active = true;
		loadEditor().then(
			(module) => {
				if (active) setClient(() => module.ClientEditor);
			},
			() => {
				if (active) setFailed(true);
			},
		);
		return () => {
			active = false;
		};
	}, []);
	if (typeof props.documentKey !== "string" || props.documentKey.length === 0)
		return <p role="alert">Invalid rich-text document identity.</p>;
	let value: RichTextDocument;
	try {
		value = parseRichTextDocument(props.value);
	} catch {
		return <p role="alert">Invalid rich-text document.</p>;
	}
	if (props.readOnly)
		return <RichTextContent value={value} label={props.label} />;
	return Client ? (
		<Client key={props.documentKey} {...props} value={value} />
	) : (
		<div aria-busy={!failed}>
			<RichTextContent value={value} label={props.label} />
			<output>{failed ? "Editor could not load." : "Loading editor…"}</output>
		</div>
	);
}
