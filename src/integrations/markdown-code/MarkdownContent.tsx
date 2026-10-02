import type { CSSProperties, ReactNode } from "react";
import { createElement, useEffect, useRef, useState } from "react";
import type { MarkdownNode } from "./types";
import {
	markdownTags,
	normalizeMarkdownDocument,
	safeMarkdownHref,
} from "./types";

const tags = new Set<string>(markdownTags);
const color = (value: string | undefined) =>
	value && /^#[a-f\d]{6}([a-f\d]{2})?$/i.test(value) ? value : undefined;
function CodeBlock({
	node,
}: {
	node: Extract<MarkdownNode, { kind: "code" }>;
}) {
	const [status, setStatus] = useState("");
	const [ready, setReady] = useState(false);
	const pending = useRef(false);
	const generation = useRef(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset pending copy state when code changes.
	useEffect(() => {
		generation.current++;
		pending.current = false;
		setStatus("");
		setReady(true);
		return () => {
			generation.current++;
		};
	}, [node.text]);
	const copy = async () => {
		if (pending.current) return;
		pending.current = true;
		setStatus("Copying");
		const current = generation.current;
		try {
			if (!navigator.clipboard?.writeText) throw new Error("Unavailable");
			await navigator.clipboard.writeText(node.text);
			if (generation.current === current) setStatus("Copied");
		} catch {
			if (generation.current === current)
				setStatus("Could not copy. Select the code and copy it manually.");
		} finally {
			if (generation.current === current) pending.current = false;
		}
	};
	return (
		<figure className="markdown-code-block">
			<figcaption>
				<span>{node.language}</span>
				<button
					type="button"
					aria-label={`Copy ${node.language} code`}
					disabled={!ready || status === "Copying"}
					onClick={copy}
				>
					Copy code
				</button>
				<output aria-live="polite">{status}</output>
			</figcaption>
			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable code must be keyboard accessible. */}
			{/* biome-ignore lint/a11y/useSemanticElements: The labeled scroll region preserves preformatted code semantics. */}
			<pre role="region" tabIndex={0} aria-label={`${node.language} code`}>
				<code>
					{node.lines
						? node.lines.map((line, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: Immutable syntax lines have no state or identity.
								<span key={`line-${index}`}>
									{index > 0 ? "\n" : ""}
									{line.map((span, column) => (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: Immutable syntax tokens have no state or identity.
											key={`token-${column}`}
											style={
												{
													"--markdown-token-light": color(span.light),
													"--markdown-token-dark": color(span.dark),
												} as CSSProperties
											}
										>
											{span.text}
										</span>
									))}
								</span>
							))
						: node.text}
				</code>
			</pre>
		</figure>
	);
}
function render(node: MarkdownNode, key: string): ReactNode {
	if (node.kind === "text") return node.text;
	if (node.kind === "code") return <CodeBlock node={node} key={key} />;
	if (!tags.has(node.tag)) return null;
	const children = node.children.map((child, index) =>
		render(child, `${key}-${index}`),
	);
	if (node.tag === "a")
		return createElement(
			"a",
			{
				key,
				href: safeMarkdownHref(node.href ?? ""),
				rel: "nofollow noreferrer",
			},
			children,
		);
	if (node.tag === "br" || node.tag === "hr")
		return createElement(node.tag, { key });
	return createElement(
		node.tag,
		{
			key,
			...(node.tag === "ol" && Number.isSafeInteger(node.start)
				? { start: node.start }
				: {}),
		},
		children,
	);
}
export function MarkdownContent({
	document,
	label = "Markdown content",
}: {
	document: unknown;
	label?: string;
}) {
	const normalized = normalizeMarkdownDocument(document);
	return (
		<section className="markdown-content" aria-label={label}>
			{normalized.nodes.map((node, index) => render(node, `node-${index}`))}
		</section>
	);
}
