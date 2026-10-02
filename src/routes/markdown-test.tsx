import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getMarkdownReference } from "../features/markdown-reference";
import { MarkdownContent } from "../integrations/markdown-code/MarkdownContent";
import "../integrations/markdown-code/markdown-code.css";

export const Route = createFileRoute("/markdown-test")({
	loader: () => getMarkdownReference(),
	component: MarkdownReference,
});
function MarkdownReference() {
	const document = Route.useLoaderData();
	const [visible, setVisible] = useState(true);
	return (
		<main className="mx-auto max-w-3xl p-6">
			<h1 className="text-2xl font-semibold">Markdown / Code Content</h1>
			<button type="button" onClick={() => setVisible((current) => !current)}>
				Toggle content
			</button>
			{visible && <MarkdownContent document={document} />}
		</main>
	);
}
